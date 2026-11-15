import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type { DocumentSummary } from './registryService';
import type { AuditEntry } from './auditService';
import {
  buildCertificateData,
  CertificateData,
  ChainEvidence,
  generateCertificatePdf,
  isCertificateValid,
  readCertificatePdf,
  verifyCertificate,
} from './certificateService';
import { sha256Hex } from '../utils/hash';

const ALICE = '0x' + 'a'.repeat(64);
const BOB = '0x' + 'b'.repeat(64);
const CAROL = '0x' + 'c'.repeat(64);

const document: DocumentSummary = {
  documentId: '0x' + 'd'.repeat(64),
  title: 'Lease 2026',
  description: '',
  creator: ALICE,
  walrusBlobId: 'blob-original',
  signedBlobIds: ['blob-v1', 'blob-v2'],
  authorizedSigners: [BOB, CAROL],
  signatures: [
    { signer: BOB, signedAt: 2000 },
    { signer: CAROL, signedAt: 3000 },
  ],
  createdAt: 1000,
  status: 2,
};

const entry = (kind: AuditEntry['kind'], digest: string, subject?: string): AuditEntry => ({
  kind,
  digest,
  subject,
  eventSeq: 0,
  timestampMs: 0,
  actor: subject ?? ALICE,
});

const trail: AuditEntry[] = [
  entry('created', 'tx-create'),
  entry('signed', 'tx-bob', BOB),
  entry('signed', 'tx-carol', CAROL),
  entry('completed', 'tx-carol'),
];

const context = { network: 'testnet', packageId: '0xpkg', encryptedSha256: 'abc123', issuedAt: 5000 };

function certificate(overrides: Partial<CertificateData> = {}): CertificateData {
  return { ...buildCertificateData(document, trail, context), ...overrides };
}

const evidence = (overrides: Partial<ChainEvidence> = {}): ChainEvidence => ({
  document,
  trail,
  encryptedSha256: 'abc123',
  ...overrides,
});

describe('buildCertificateData', () => {
  it('collects signers, transactions and the final version', () => {
    expect(certificate()).toEqual({
      version: 1,
      network: 'testnet',
      packageId: '0xpkg',
      documentId: document.documentId,
      title: 'Lease 2026',
      creator: ALICE,
      createdAt: 1000,
      createdDigest: 'tx-create',
      completedAt: 3000,
      completedDigest: 'tx-carol',
      signers: [
        { address: BOB, signedAt: 2000, digest: 'tx-bob' },
        { address: CAROL, signedAt: 3000, digest: 'tx-carol' },
      ],
      finalBlobId: 'blob-v2',
      encryptedSha256: 'abc123',
      documentSha256: undefined,
      issuedAt: 5000,
    });
  });

  it('refuses incomplete documents', () => {
    expect(() => buildCertificateData({ ...document, status: 1 }, trail, context)).toThrow(/every signer has signed/);
  });

  it('refuses when a signature transaction is missing', () => {
    expect(() => buildCertificateData(document, trail.slice(0, 2), context)).toThrow(/signature of 0xcccc/);
  });
});

describe('certificate PDF', () => {
  it('round-trips the embedded data', async () => {
    const data = certificate({ documentSha256: 'feed' });
    const bytes = await generateCertificatePdf(data);

    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getTitle()).toBe('WalSign certificate - Lease 2026');
    await expect(readCertificatePdf(bytes)).resolves.toEqual(JSON.parse(JSON.stringify(data)));
  });

  it('handles titles outside the PDF font character set and many signers', async () => {
    const signers = Array.from({ length: 40 }, (_, i) => ({
      address: '0x' + i.toString(16).padStart(64, '0'),
      signedAt: 2000 + i,
      digest: `tx-${i}`,
    }));
    const data = certificate({ title: 'Mietvertrag 契約 ✍️', signers });

    const bytes = await generateCertificatePdf(data);

    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1);
    expect((await readCertificatePdf(bytes)).title).toBe('Mietvertrag 契約 ✍️');
  });

  it('rejects PDFs that are not certificates', async () => {
    const other = await PDFDocument.create();
    other.addPage();
    await expect(readCertificatePdf(await other.save())).rejects.toThrow('not a WalSign certificate');
    await expect(readCertificatePdf(new TextEncoder().encode('hello'))).rejects.toThrow('not a readable PDF');
  });

  it('rejects a damaged payload', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    pdf.setSubject('walsign-certificate:v1:bm90IGpzb24=');
    await expect(readCertificatePdf(await pdf.save())).rejects.toThrow('damaged');
  });
});

describe('verifyCertificate', () => {
  it('passes every check for an untampered certificate', () => {
    const checks = verifyCertificate(certificate(), evidence());
    expect(checks.every((c) => c.status === 'pass')).toBe(true);
    expect(checks).toHaveLength(10);
    expect(isCertificateValid(checks)).toBe(true);
  });

  it('fails when the document does not exist', () => {
    const checks = verifyCertificate(certificate(), evidence({ document: null }));
    expect(checks).toEqual([expect.objectContaining({ label: 'Document exists on chain', status: 'fail' })]);
    expect(isCertificateValid(checks)).toBe(false);
  });

  it.each([
    ['a changed title', { title: 'Lease 2025' }, 'Title and creator match'],
    ['an extra signer', { signers: [...certificate().signers, { address: ALICE, signedAt: 1, digest: 'x' }] }, 'Signer list matches'],
    [
      'a forged signing time',
      { signers: [{ address: BOB, signedAt: 1999, digest: 'tx-bob' }, certificate().signers[1]] },
      'Signature of 0xbbbbbbbb…',
    ],
    [
      'a wrong transaction digest',
      { signers: [{ address: BOB, signedAt: 2000, digest: 'tx-forged' }, certificate().signers[1]] },
      'Signature of 0xbbbbbbbb…',
    ],
    ['a wrong creation transaction', { createdDigest: 'tx-x' }, 'Creation transaction matches'],
    ['a wrong completion transaction', { completedDigest: 'tx-x' }, 'Completion transaction matches'],
    ['an outdated version', { finalBlobId: 'blob-v1' }, 'Final version matches'],
    ['a different file hash', { encryptedSha256: 'other' }, 'Stored file matches its hash'],
  ])('detects %s', (_label, overrides, failingCheck) => {
    const checks = verifyCertificate(certificate(overrides as Partial<CertificateData>), evidence());
    expect(checks.find((c) => c.label === failingCheck)?.status).toBe('fail');
    expect(isCertificateValid(checks)).toBe(false);
  });

  it('flags a document that is no longer complete on chain', () => {
    const checks = verifyCertificate(certificate(), evidence({ document: { ...document, status: 3 } }));
    expect(checks.find((c) => c.label === 'Document is fully signed')?.status).toBe('fail');
  });

  it('marks the file hash as unavailable when Walrus has no copy, without failing', () => {
    const checks = verifyCertificate(certificate(), evidence({ encryptedSha256: null }));
    expect(checks.find((c) => c.label === 'Stored file matches its hash')?.status).toBe('unavailable');
    expect(isCertificateValid(checks)).toBe(true);
  });
});

describe('sha256Hex', () => {
  it('hashes bytes to hex', async () => {
    await expect(sha256Hex(new TextEncoder().encode('abc'))).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
