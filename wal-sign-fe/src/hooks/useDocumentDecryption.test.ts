import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  account: null as { address: string } | null,
  signPersonalMessage: vi.fn(),
  downloadFromWalrus: vi.fn(),
  decryptPDF: vi.fn(),
  createSessionKey: vi.fn(),
}));

vi.mock('@mysten/dapp-kit', () => ({
  useCurrentAccount: () => mocks.account,
  useSignPersonalMessage: () => ({ mutateAsync: mocks.signPersonalMessage }),
}));
vi.mock('../services/walrusService', () => ({ downloadFromWalrus: mocks.downloadFromWalrus }));
vi.mock('../services/documentService', () => ({ decryptPDF: mocks.decryptPDF }));
vi.mock('@mysten/seal', () => ({ SessionKey: { create: mocks.createSessionKey } }));

import { useDocumentDecryption } from './useDocumentDecryption';

beforeEach(() => {
  mocks.account = { address: '0xbob' };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('useDocumentDecryption', () => {
  it('downloads, decrypts and returns the PDF as a Blob', async () => {
    mocks.downloadFromWalrus.mockResolvedValue(new Uint8Array([1]));
    mocks.createSessionKey.mockResolvedValue({ key: 'session' });
    mocks.decryptPDF.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));

    const { result } = renderHook(() => useDocumentDecryption());
    let blob: Blob | null = null;
    await act(async () => {
      blob = await result.current.decryptDocument('0xdoc', 'blob-1');
    });

    expect(blob).toBeInstanceOf(Blob);
    expect(blob!.type).toBe('application/pdf');
    expect(mocks.downloadFromWalrus).toHaveBeenCalledWith('blob-1');
    expect(mocks.createSessionKey).toHaveBeenCalledWith(
      expect.objectContaining({ address: '0xbob', packageId: '0xpackage', ttlMin: 30 }),
    );
    expect(mocks.decryptPDF.mock.calls[0][2]).toBe('0xdoc');
    expect(result.current.error).toBeNull();
    expect(result.current.isDecrypting).toBe(false);
  });

  it('refuses to decrypt without a connected wallet', async () => {
    mocks.account = null;
    const { result } = renderHook(() => useDocumentDecryption());

    let blob: Blob | null = new Blob();
    await act(async () => {
      blob = await result.current.decryptDocument('0xdoc', 'blob-1');
    });

    expect(blob).toBeNull();
    expect(result.current.error).toBe('Wallet not connected');
    expect(mocks.downloadFromWalrus).not.toHaveBeenCalled();
  });

  it('surfaces download and access errors', async () => {
    mocks.downloadFromWalrus.mockRejectedValue(new Error('Blob not found on Walrus: blob-1'));
    const { result } = renderHook(() => useDocumentDecryption());

    await act(async () => {
      await result.current.decryptDocument('0xdoc', 'blob-1');
    });

    expect(result.current.error).toBe('Blob not found on Walrus: blob-1');
    expect(result.current.isDecrypting).toBe(false);
  });

  it('reports a missing plaintext as an authorization problem', async () => {
    mocks.downloadFromWalrus.mockResolvedValue(new Uint8Array([1]));
    mocks.createSessionKey.mockResolvedValue({});
    mocks.decryptPDF.mockResolvedValue(undefined);
    const { result } = renderHook(() => useDocumentDecryption());

    await act(async () => {
      await result.current.decryptDocument('0xdoc', 'blob-1');
    });

    expect(result.current.error).toBe('Not authorized or wrong key');
  });
});
