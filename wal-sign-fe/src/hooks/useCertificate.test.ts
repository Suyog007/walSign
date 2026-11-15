import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentSummary } from '../services/registryService';
import type { AuditEntry } from '../services/auditService';

const mocks = vi.hoisted(() => ({
  getAuditTrail: vi.fn(),
  getDocumentDetails: vi.fn(),
  downloadFromWalrus: vi.fn(),
  downloadBytes: vi.fn(),
}));

vi.mock('../services/auditService', () => ({ getAuditTrail: mocks.getAuditTrail }));
vi.mock('../services/walrusService', () => ({ downloadFromWalrus: mocks.downloadFromWalrus }));
vi.mock('../utils/download', () => ({ downloadBytes: mocks.downloadBytes }));
vi.mock('../services/registryService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/registryService')>()),
  getDocumentDetails: mocks.getDocumentDetails,
}));

import { useCertificate, useCertificateVerification } from './useCertificate';
import { useAuditTrail } from './useAuditTrail';
import { sha256Hex } from '../utils/hash';

const BOB = '0x' + 'b'.repeat(64);
const document = {
  documentId: '0xdoc',
  title: 'Lease / 2026',
  creator: '0xalice',
  walrusBlobId: 'blob-0',
  signedBlobIds: ['blob-1'],
  authorizedSigners: [BOB],
  signatures: [{ signer: BOB, signedAt: 2000 }],
  createdAt: 1000,
  status: 2,
} as DocumentSummary;

const trail: AuditEntry[] = [
  { kind: 'created', digest: 'tx-create', eventSeq: 0, timestampMs: 1000, actor: '0xalice' },
  { kind: 'signed', digest: 'tx-sign', eventSeq: 0, timestampMs: 2000, actor: BOB, subject: BOB },
  { kind: 'completed', digest: 'tx-sign', eventSeq: 1, timestampMs: 2000, actor: BOB },
];

const blob = new Uint8Array([1, 2, 3]);

beforeEach(() => {
  mocks.getAuditTrail.mockResolvedValue(trail);
  mocks.downloadFromWalrus.mockResolvedValue(blob);
  mocks.getDocumentDetails.mockResolvedValue(document);
});

async function issueCertificate(signedPdf?: Blob) {
  const { result } = renderHook(() => useCertificate());
  let ok = false;
  await act(async () => {
    ok = await result.current.issue(document, signedPdf);
  });
  return { result, ok };
}

describe('useCertificate', () => {
  it('builds the certificate from chain data and downloads it', async () => {
    const { ok } = await issueCertificate();

    expect(ok).toBe(true);
    expect(mocks.downloadFromWalrus).toHaveBeenCalledWith('blob-1');
    const [bytes, filename] = mocks.downloadBytes.mock.calls[0];
    expect(filename).toBe('Lease-2026-certificate.pdf');
    expect(bytes).toBeInstanceOf(Uint8Array);
  });

  it('reports why a certificate cannot be issued', async () => {
    mocks.getAuditTrail.mockResolvedValue([]);
    const { result, ok } = await issueCertificate();

    expect(ok).toBe(false);
    expect(result.current.error).toMatch(/creation transaction/);
    expect(mocks.downloadBytes).not.toHaveBeenCalled();
  });
});

describe('useCertificateVerification', () => {
  async function certificateFile(signedPdf?: Blob) {
    await issueCertificate(signedPdf);
    const calls = mocks.downloadBytes.mock.calls;
    const bytes: Uint8Array = calls[calls.length - 1][0];
    return new File([bytes.slice()], 'certificate.pdf', { type: 'application/pdf' });
  }

  it('confirms a genuine certificate', async () => {
    const file = await certificateFile();
    const { result } = renderHook(() => useCertificateVerification());

    await act(() => result.current.verify(file));

    expect(result.current.error).toBeNull();
    expect(result.current.result?.valid).toBe(true);
    expect(result.current.result?.certificate.documentId).toBe('0xdoc');
    expect(mocks.getDocumentDetails).toHaveBeenCalledWith(expect.anything(), '0xdoc');
  });

  it('flags a certificate whose document changed on chain', async () => {
    const file = await certificateFile();
    mocks.getDocumentDetails.mockResolvedValue({ ...document, signedBlobIds: ['blob-1', 'blob-2'] });
    const { result } = renderHook(() => useCertificateVerification());

    await act(() => result.current.verify(file));

    expect(result.current.result?.valid).toBe(false);
  });

  it('still verifies when Walrus no longer serves the blob', async () => {
    const file = await certificateFile();
    mocks.downloadFromWalrus.mockRejectedValue(new Error('Blob not found'));
    const { result } = renderHook(() => useCertificateVerification());

    await act(() => result.current.verify(file));

    expect(result.current.result?.checks.find((c) => c.status === 'unavailable')).toBeDefined();
    expect(result.current.result?.valid).toBe(true);
  });

  it('rejects files that are not certificates', async () => {
    const { result } = renderHook(() => useCertificateVerification());
    await act(() => result.current.verify(new File(['hello'], 'notes.txt')));
    expect(result.current.error).toBe('This file is not a readable PDF');
    expect(result.current.result).toBeNull();
  });

  it('compares a signed PDF with the certified hash', async () => {
    const signedPdf = new Blob(['%PDF-signed']);
    const file = await certificateFile(signedPdf);
    const { result } = renderHook(() => useCertificateVerification());
    await act(() => result.current.verify(file));

    await act(() => result.current.compareDocument(new File(['%PDF-signed'], 'signed.pdf')));
    expect(result.current.documentMatch).toBe(true);

    await act(() => result.current.compareDocument(new File(['%PDF-edited'], 'signed.pdf')));
    expect(result.current.documentMatch).toBe(false);
    expect(result.current.result?.certificate.documentSha256).toBe(
      await sha256Hex(new TextEncoder().encode('%PDF-signed')),
    );
  });
});

describe('useAuditTrail', () => {
  it('loads the trail of the document', async () => {
    const { result } = renderHook(() => useAuditTrail('0xdoc'));
    await waitFor(() => expect(result.current.entries).toEqual(trail));
  });

  it('reports load errors', async () => {
    mocks.getAuditTrail.mockRejectedValue(new Error('rpc down'));
    const { result } = renderHook(() => useAuditTrail('0xdoc'));
    await waitFor(() => expect(result.current.error).toBe('rpc down'));
  });
});
