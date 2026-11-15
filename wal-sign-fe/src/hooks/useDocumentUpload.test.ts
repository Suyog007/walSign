import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Callbacks = { onSuccess: (result: unknown) => void; onError: (error: unknown) => void };

const mocks = vi.hoisted(() => ({
  account: null as { address: string } | null,
  signAndExecute: vi.fn(),
  encryptPDF: vi.fn(),
  uploadToWalrus: vi.fn(),
  moveCalls: [] as Array<{ target: string }>,
}));

vi.mock('@mysten/dapp-kit', () => ({
  useCurrentAccount: () => mocks.account,
  useSignAndExecuteTransactionBlock: () => ({ mutate: mocks.signAndExecute }),
}));
vi.mock('../services/documentService', () => ({ encryptPDF: mocks.encryptPDF }));
vi.mock('../services/walrusService', () => ({ uploadToWalrus: mocks.uploadToWalrus }));
vi.mock('@mysten/sui/transactions', () => ({
  Transaction: vi.fn(() => ({
    moveCall: (call: { target: string }) => mocks.moveCalls.push(call),
    object: (id: string) => id,
    pure: { string: (v: string) => v, vector: (_t: string, v: unknown) => v },
  })),
}));

import { useDocumentUpload } from './useDocumentUpload';

const pdf = new File(['%PDF'], 'contract.pdf', { type: 'application/pdf' });

beforeEach(() => {
  mocks.account = { address: '0xalice' };
  mocks.moveCalls.length = 0;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('useDocumentUpload', () => {
  it('creates the document, encrypts under its id, uploads and records the blob', async () => {
    mocks.signAndExecute
      .mockImplementationOnce((_tx: unknown, { onSuccess }: Callbacks) =>
        onSuccess({
          digest: 'create-digest',
          objectChanges: [
            { type: 'created', objectType: '0xpackage::wal_sign::SignerCap', objectId: '0xcap' },
            { type: 'created', objectType: '0xpackage::wal_sign::Document', objectId: '0xdoc' },
          ],
        }),
      )
      .mockImplementationOnce((_tx: unknown, { onSuccess }: Callbacks) => onSuccess({ digest: 'update' }));
    mocks.encryptPDF.mockResolvedValue({ encryptedData: new Uint8Array([1]) });
    mocks.uploadToWalrus.mockResolvedValue('blob-1');

    const { result } = renderHook(() => useDocumentUpload());
    let created: Awaited<ReturnType<typeof result.current.uploadDocument>> | undefined;
    await act(async () => {
      created = await result.current.uploadDocument(pdf, 'Contract', ['0xbob', '0xbob', '0xcarol']);
    });

    expect(created).toEqual({ documentId: '0xdoc', walrusBlobId: 'blob-1', txHash: 'create-digest' });
    expect(mocks.moveCalls.map((c) => c.target)).toEqual([
      '0xpackage::wal_sign::create_document',
      '0xpackage::wal_sign::update_blob_id',
    ]);
    // duplicate signers are removed before they reach the chain
    expect((mocks.moveCalls[0] as any).arguments[4]).toEqual(['0xbob', '0xcarol']);
    expect(mocks.encryptPDF).toHaveBeenCalledWith('0xpackage', '0xdoc', pdf);
    expect(result.current.progress.stage).toBe('complete');
    expect(result.current.isUploading).toBe(false);
  });

  it('fails fast when no wallet is connected', async () => {
    mocks.account = null;
    const { result } = renderHook(() => useDocumentUpload());

    await expect(result.current.uploadDocument(pdf, 'Contract', [])).rejects.toThrow('Wallet not connected');
    expect(mocks.signAndExecute).not.toHaveBeenCalled();
  });

  it('moves to the error stage when the wallet rejects the transaction', async () => {
    mocks.signAndExecute.mockImplementationOnce((_tx: unknown, { onError }: Callbacks) =>
      onError(new Error('User rejected the request')),
    );
    const { result } = renderHook(() => useDocumentUpload());

    await act(async () => {
      await expect(result.current.uploadDocument(pdf, 'Contract', ['0xbob'])).rejects.toThrow('User rejected');
    });

    expect(result.current.progress).toMatchObject({ stage: 'error', message: 'User rejected the request' });
    expect(mocks.encryptPDF).not.toHaveBeenCalled();

    act(() => result.current.resetProgress());
    expect(result.current.progress.stage).toBe('idle');
  });

  it('errors when the transaction did not create a Document', async () => {
    mocks.signAndExecute.mockImplementationOnce((_tx: unknown, { onSuccess }: Callbacks) =>
      onSuccess({ digest: 'd', objectChanges: [] }),
    );
    const { result } = renderHook(() => useDocumentUpload());

    await act(async () => {
      await expect(result.current.uploadDocument(pdf, 'Contract', ['0xbob'])).rejects.toThrow(
        'no document object found',
      );
    });
  });
});
