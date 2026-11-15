import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  signAndExecute: vi.fn(),
  encryptPDF: vi.fn(),
  uploadToWalrus: vi.fn(),
}));

vi.mock('@mysten/dapp-kit', () => ({
  useSignAndExecuteTransactionBlock: () => ({ mutateAsync: mocks.signAndExecute }),
}));
vi.mock('../services/documentService', () => ({ encryptPDF: mocks.encryptPDF }));
vi.mock('../services/walrusService', () => ({ uploadToWalrus: mocks.uploadToWalrus }));
vi.mock('../services/bulkSendService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/bulkSendService')>()),
  buildCreateDocumentsTx: (docs: unknown[]) => ({ kind: 'create', count: docs.length }),
  buildFinalizeDocumentsTx: (uploads: unknown[], workflow: unknown) => ({ kind: 'finalize', uploads, workflow }),
}));

import { useTemplateSend } from './useTemplateSend';

const A = '0x' + 'a'.repeat(64);
const B = '0x' + 'b'.repeat(64);
const created = (ids: string[]) => ({
  events: ids.map((id) => ({ type: '0xpackage::wal_sign::DocumentCreated', parsedJson: { document_id: id } })),
});
const input = { pdf: new Uint8Array([37]), title: 'NDA', rows: [[A], [B]], workflow: { sequential: true } };

beforeEach(() => {
  mocks.encryptPDF.mockImplementation(async (_pkg: string, id: string) => ({ encryptedData: new TextEncoder().encode(id) }));
  mocks.uploadToWalrus.mockImplementation(async (data: Uint8Array) => `blob-${new TextDecoder().decode(data)}`);
});

describe('useTemplateSend', () => {
  it('creates, encrypts per document and finalises with two wallet prompts', async () => {
    mocks.signAndExecute.mockResolvedValueOnce(created(['0xd1', '0xd2'])).mockResolvedValueOnce({});
    const { result } = renderHook(() => useTemplateSend());

    await act(async () => {
      await result.current.send(input);
    });

    expect(mocks.signAndExecute).toHaveBeenCalledTimes(2);
    expect(mocks.encryptPDF.mock.calls.map((c) => c[1])).toEqual(['0xd1', '0xd2']);
    expect(mocks.signAndExecute.mock.calls[1][0].transactionBlock).toEqual({
      kind: 'finalize',
      uploads: [
        { documentId: '0xd1', walrusBlobId: 'blob-0xd1' },
        { documentId: '0xd2', walrusBlobId: 'blob-0xd2' },
      ],
      workflow: { sequential: true },
    });
    expect(result.current.sent.map((d) => [d.documentId, d.signers])).toEqual([
      ['0xd1', [A]],
      ['0xd2', [B]],
    ]);
    expect(result.current.progress).toEqual({ stage: 'complete', done: 2, total: 2 });
  });

  it('finalises the documents that uploaded and reports the others', async () => {
    mocks.signAndExecute.mockResolvedValueOnce(created(['0xd1', '0xd2'])).mockResolvedValueOnce({});
    mocks.uploadToWalrus.mockResolvedValueOnce('blob-1').mockRejectedValueOnce(new Error('Walrus upload failed (503)'));
    const { result } = renderHook(() => useTemplateSend());

    await act(async () => {
      await result.current.send(input);
    });

    expect(mocks.signAndExecute.mock.calls[1][0].transactionBlock.uploads).toHaveLength(1);
    expect(result.current.sent).toHaveLength(1);
    expect(result.current.failed).toEqual([
      expect.objectContaining({ signers: [B], error: 'Walrus upload failed (503)' }),
    ]);
  });

  it('stops when the wallet rejects the creation', async () => {
    mocks.signAndExecute.mockRejectedValueOnce(new Error('User rejected the request'));
    const { result } = renderHook(() => useTemplateSend());

    await act(async () => {
      await result.current.send(input);
    });

    expect(result.current.error).toBe('User rejected the request');
    expect(result.current.progress.stage).toBe('error');
    expect(mocks.encryptPDF).not.toHaveBeenCalled();

    act(() => result.current.reset());
    expect(result.current.progress.stage).toBe('idle');
  });

  it('requires a title', async () => {
    const { result } = renderHook(() => useTemplateSend());
    await act(async () => {
      await result.current.send({ ...input, title: ' ' });
    });
    expect(result.current.error).toBe('Give the documents a title');
    expect(mocks.signAndExecute).not.toHaveBeenCalled();
  });
});
