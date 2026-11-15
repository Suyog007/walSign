import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentSummary } from '../services/registryService';

const mocks = vi.hoisted(() => ({
  account: { address: '0xbob' } as { address: string } | null,
  signAndExecute: vi.fn(),
  findSignerCap: vi.fn(),
}));

vi.mock('@mysten/dapp-kit', () => ({
  useCurrentAccount: () => mocks.account,
  useSignAndExecuteTransactionBlock: () => ({ mutateAsync: mocks.signAndExecute }),
}));
vi.mock('../services/workflowService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/workflowService')>();
  return {
    ...actual,
    findSignerCap: mocks.findSignerCap,
    buildDeclineTx: (documentId: string, capId: string, reason: string) => ({ kind: 'decline', documentId, capId, reason }),
    buildReassignTx: (documentId: string, from: string, to: string) => ({ kind: 'reassign', documentId, from, to }),
    addWorkflowCalls: (_tx: unknown, documentId: string, settings: unknown) => ({ kind: 'settings', documentId, settings }),
  };
});

import { useWorkflowActions } from './useWorkflowActions';

const NEW_SIGNER = '0x' + 'e'.repeat(64);
const document = { documentId: '0xdoc', creator: '0xalice', authorizedSigners: ['0xbob'] } as DocumentSummary;

beforeEach(() => {
  mocks.account = { address: '0xbob' };
  mocks.signAndExecute.mockResolvedValue({ digest: 'd' });
});

describe('useWorkflowActions', () => {
  it('declines with the signer cap and notifies the caller', async () => {
    mocks.findSignerCap.mockResolvedValue('0xcap');
    const onChanged = vi.fn();
    const { result } = renderHook(() => useWorkflowActions(document, onChanged));

    let ok = false;
    await act(async () => {
      ok = await result.current.decline('Clause 3 is wrong');
    });

    expect(ok).toBe(true);
    expect(mocks.findSignerCap).toHaveBeenCalledWith(expect.anything(), '0xbob', '0xdoc');
    expect(mocks.signAndExecute.mock.calls[0][0].transactionBlock).toEqual({
      kind: 'decline',
      documentId: '0xdoc',
      capId: '0xcap',
      reason: 'Clause 3 is wrong',
    });
    expect(onChanged).toHaveBeenCalled();
    expect(result.current.pending).toBeNull();
  });

  it('requires a reason before declining', async () => {
    const { result } = renderHook(() => useWorkflowActions(document));
    await act(async () => {
      await result.current.decline(' ');
    });
    expect(result.current.error).toMatch(/why you are declining/);
    expect(mocks.signAndExecute).not.toHaveBeenCalled();
  });

  it('reports a missing signer cap', async () => {
    mocks.findSignerCap.mockResolvedValue(null);
    const { result } = renderHook(() => useWorkflowActions(document));
    await act(async () => {
      await result.current.decline('No');
    });
    expect(result.current.error).toMatch(/signing capability/);
  });

  it('reassigns to a validated address', async () => {
    const { result } = renderHook(() => useWorkflowActions(document));
    await act(async () => {
      await result.current.reassign('0xbob', NEW_SIGNER);
    });
    expect(mocks.signAndExecute.mock.calls[0][0].transactionBlock).toMatchObject({
      kind: 'reassign',
      from: '0xbob',
      to: NEW_SIGNER,
    });
  });

  it('rejects an invalid reassignment target', async () => {
    const { result } = renderHook(() => useWorkflowActions(document));
    let ok = true;
    await act(async () => {
      ok = await result.current.reassign('0xbob', 'not-an-address');
    });
    expect(ok).toBe(false);
    expect(result.current.error).toBe('Enter a valid Sui address');
  });

  it('saves settings, skipping the wallet when nothing changed', async () => {
    const { result } = renderHook(() => useWorkflowActions(document));
    await act(async () => {
      await result.current.saveSettings({});
    });
    expect(mocks.signAndExecute).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.saveSettings({ sequential: true, deadlineMs: null });
    });
    expect(mocks.signAndExecute.mock.calls[0][0].transactionBlock).toEqual({
      kind: 'settings',
      documentId: '0xdoc',
      settings: { sequential: true, deadlineMs: null },
    });
  });

  it('surfaces wallet errors and resets the pending state', async () => {
    mocks.signAndExecute.mockRejectedValue(new Error('User rejected the request'));
    const onChanged = vi.fn();
    const { result } = renderHook(() => useWorkflowActions(document, onChanged));

    let ok = true;
    await act(async () => {
      ok = await result.current.saveSettings({ sequential: false });
    });

    expect(ok).toBe(false);
    expect(result.current.error).toBe('User rejected the request');
    expect(result.current.pending).toBeNull();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('needs a connected wallet', async () => {
    mocks.account = null;
    const { result } = renderHook(() => useWorkflowActions(document));
    await act(async () => {
      await result.current.saveSettings({ sequential: true });
    });
    expect(result.current.error).toBe('Wallet not connected');
  });
});
