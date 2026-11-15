import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from 'pdf-lib';
import { fromBase64, toBase64 } from '@mysten/bcs';
import { DocumentSummary, getLatestBlobId } from './registryService';
import { AuditEntry } from './auditService';

const PAYLOAD_PREFIX = 'walsign-certificate:v1:';

export interface CertificateSigner {
  address: string;
  signedAt: number;
  digest: string;
}

/** Everything a certificate states; embedded in the PDF so it can be verified later */
export interface CertificateData {
  version: 1;
  network: string;
  packageId: string;
  documentId: string;
  title: string;
  creator: string;
  createdAt: number;
  createdDigest: string;
  completedAt: number;
  completedDigest: string;
  signers: CertificateSigner[];
  /** Walrus blob of the final signed version */
  finalBlobId: string;
  /** SHA-256 of the final encrypted blob as stored on Walrus (verifiable by anyone) */
  encryptedSha256: string;
  /** SHA-256 of the decrypted final PDF, when the issuer had it decrypted */
  documentSha256?: string;
  issuedAt: number;
}

export type CheckStatus = 'pass' | 'fail' | 'unavailable';

export interface CertificateCheck {
  label: string;
  status: CheckStatus;
  detail?: string;
}

/** Chain state a certificate is compared against */
export interface ChainEvidence {
  document: DocumentSummary | null;
  trail: AuditEntry[];
  /** SHA-256 of the blob currently stored under `finalBlobId`, or null if it could not be downloaded */
  encryptedSha256: string | null;
}

// ======== Building ========

/** Assemble certificate data for a fully signed document from its chain state */
export function buildCertificateData(
  document: DocumentSummary,
  trail: AuditEntry[],
  context: {
    network: string;
    packageId: string;
    encryptedSha256: string;
    documentSha256?: string;
    issuedAt: number;
  },
): CertificateData {
  if (document.status !== 2) {
    throw new Error('A certificate can only be issued once every signer has signed');
  }
  const created = trail.find((e) => e.kind === 'created');
  if (!created) throw new Error('The document creation transaction could not be found');

  const signers = document.authorizedSigners.map((address) => {
    const signature = document.signatures.find((s) => s.signer === address);
    const event = [...trail].reverse().find((e) => e.kind === 'signed' && e.subject === address);
    if (!signature || !event) {
      throw new Error(`The signature of ${address} could not be found on chain`);
    }
    return { address, signedAt: signature.signedAt, digest: event.digest };
  });

  const completed =
    trail.find((e) => e.kind === 'completed') ?? [...trail].reverse().find((e) => e.kind === 'signed')!;

  return {
    version: 1,
    network: context.network,
    packageId: context.packageId,
    documentId: document.documentId,
    title: document.title,
    creator: document.creator,
    createdAt: document.createdAt,
    createdDigest: created.digest,
    completedAt: Math.max(...signers.map((s) => s.signedAt)),
    completedDigest: completed.digest,
    signers,
    finalBlobId: getLatestBlobId(document),
    encryptedSha256: context.encryptedSha256,
    documentSha256: context.documentSha256,
    issuedAt: context.issuedAt,
  };
}

// ======== PDF ========

const formatTime = (ms: number) => new Date(ms).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');

class PageWriter {
  private page!: PDFPage;
  private y = 0;
  private static readonly MARGIN = 50;

  constructor(
    private readonly pdf: PDFDocument,
    private readonly fonts: { regular: PDFFont; bold: PDFFont; mono: PDFFont },
  ) {
    this.newPage();
  }

  private newPage() {
    this.page = this.pdf.addPage([595.28, 841.89]); // A4
    this.y = this.page.getHeight() - PageWriter.MARGIN;
  }

  private ensureSpace(height: number) {
    if (this.y - height < PageWriter.MARGIN) this.newPage();
  }

  line(text: string, options: { size?: number; font?: 'regular' | 'bold' | 'mono'; gap?: number; muted?: boolean } = {}) {
    const size = options.size ?? 10;
    this.ensureSpace(size + 4);
    // Standard PDF fonts only cover Latin-1; the exact text stays in the embedded payload
    this.page.drawText(text.replace(/[^\x20-\x7E\xA0-\xFF]/g, '?'), {
      x: PageWriter.MARGIN,
      y: this.y - size,
      size,
      font: this.fonts[options.font ?? 'regular'],
      color: options.muted ? rgb(0.4, 0.4, 0.45) : rgb(0.1, 0.1, 0.15),
    });
    this.y -= size + (options.gap ?? 4);
  }

  field(label: string, value: string) {
    this.line(label, { size: 8, muted: true, gap: 2 });
    this.line(value, { font: 'mono', size: 9, gap: 8 });
  }

  space(height = 10) {
    this.y -= height;
  }
}

/** Render the certificate as a PDF with the data embedded for later verification */
export async function generateCertificatePdf(data: CertificateData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const writer = new PageWriter(pdf, {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    mono: await pdf.embedFont(StandardFonts.Courier),
  });

  writer.line('Certificate of Completion', { size: 22, font: 'bold', gap: 6 });
  writer.line(`"${data.title}" was signed by all ${data.signers.length} signer(s) on Sui ${data.network}.`, {
    gap: 16,
  });

  writer.field('Document ID', data.documentId);
  writer.field('Created by', data.creator);
  writer.field('Created', `${formatTime(data.createdAt)}   tx ${data.createdDigest}`);
  writer.field('Completed', `${formatTime(data.completedAt)}   tx ${data.completedDigest}`);
  writer.space();

  writer.line('Signatures', { size: 13, font: 'bold', gap: 8 });
  data.signers.forEach((signer, index) => {
    writer.line(`${index + 1}. ${signer.address}`, { font: 'mono', size: 9, gap: 2 });
    writer.line(`   Signed ${formatTime(signer.signedAt)}   tx ${signer.digest}`, { font: 'mono', size: 8, gap: 8, muted: true });
  });
  writer.space();

  writer.line('Document integrity', { size: 13, font: 'bold', gap: 8 });
  writer.field('Final version (Walrus blob ID)', data.finalBlobId);
  writer.field('SHA-256 of the encrypted final version', data.encryptedSha256);
  if (data.documentSha256) {
    writer.field('SHA-256 of the signed PDF', data.documentSha256);
  }
  writer.space();

  writer.line(`Issued ${formatTime(data.issuedAt)} · package ${data.packageId}`, { size: 8, muted: true, gap: 2 });
  writer.line('Verify this certificate on the WalSign "Verify certificate" page; it is re-checked against', {
    size: 8,
    muted: true,
    gap: 2,
  });
  writer.line('the Sui transactions and the Walrus blob listed above.', { size: 8, muted: true });

  pdf.setTitle(`WalSign certificate - ${data.title}`);
  pdf.setAuthor('WalSign');
  pdf.setCreator('WalSign');
  pdf.setCreationDate(new Date(data.issuedAt));
  pdf.setSubject(PAYLOAD_PREFIX + toBase64(new TextEncoder().encode(JSON.stringify(data))));

  return pdf.save();
}

/** Extract the embedded data from a certificate PDF */
export async function readCertificatePdf(bytes: Uint8Array): Promise<CertificateData> {
  let subject: string | undefined;
  try {
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    subject = pdf.getSubject();
  } catch {
    throw new Error('This file is not a readable PDF');
  }
  if (!subject?.startsWith(PAYLOAD_PREFIX)) {
    throw new Error('This PDF is not a WalSign certificate');
  }
  try {
    const data = JSON.parse(new TextDecoder().decode(fromBase64(subject.slice(PAYLOAD_PREFIX.length))));
    if (data.version !== 1 || !data.documentId || !Array.isArray(data.signers)) throw new Error();
    return data as CertificateData;
  } catch {
    throw new Error('The certificate data is damaged');
  }
}

// ======== Verification ========

/** Compare what a certificate states with the current chain and Walrus data */
export function verifyCertificate(certificate: CertificateData, chain: ChainEvidence): CertificateCheck[] {
  const { document, trail } = chain;
  if (!document) {
    return [{ label: 'Document exists on chain', status: 'fail', detail: `No document ${certificate.documentId}` }];
  }

  const checks: CertificateCheck[] = [{ label: 'Document exists on chain', status: 'pass' }];
  const check = (label: string, ok: boolean, detail?: string) =>
    checks.push({ label, status: ok ? 'pass' : 'fail', detail: ok ? undefined : detail });

  check(
    'Title and creator match',
    document.title === certificate.title && document.creator === certificate.creator,
    `On chain: "${document.title}" by ${document.creator}`,
  );
  check('Document is fully signed', document.status === 2, 'The document is not complete on chain');

  const onChain = [...document.authorizedSigners].sort();
  const stated = certificate.signers.map((s) => s.address).sort();
  check(
    'Signer list matches',
    onChain.length === stated.length && onChain.every((a, i) => a === stated[i]),
    `On chain: ${onChain.join(', ')}`,
  );

  for (const signer of certificate.signers) {
    const signature = document.signatures.find((s) => s.signer === signer.address);
    const event = trail.find((e) => e.kind === 'signed' && e.subject === signer.address && e.digest === signer.digest);
    check(
      `Signature of ${signer.address.slice(0, 10)}…`,
      !!signature && signature.signedAt === signer.signedAt && !!event,
      !signature
        ? 'No signature on chain'
        : !event
          ? `Not recorded in transaction ${signer.digest}`
          : `Signed at ${new Date(signature.signedAt).toISOString()} on chain`,
    );
  }

  const created = trail.find((e) => e.kind === 'created');
  check('Creation transaction matches', created?.digest === certificate.createdDigest, `On chain: ${created?.digest ?? 'not found'}`);

  const completedDigests = trail.filter((e) => e.kind === 'completed' || e.kind === 'signed').map((e) => e.digest);
  check(
    'Completion transaction matches',
    completedDigests.includes(certificate.completedDigest),
    `Transaction ${certificate.completedDigest} did not change this document`,
  );

  check(
    'Final version matches',
    getLatestBlobId(document) === certificate.finalBlobId,
    `Latest version on chain: ${getLatestBlobId(document)}`,
  );

  if (chain.encryptedSha256 === null) {
    checks.push({
      label: 'Stored file matches its hash',
      status: 'unavailable',
      detail: 'The blob could not be downloaded from Walrus (it may have expired)',
    });
  } else {
    check(
      'Stored file matches its hash',
      chain.encryptedSha256 === certificate.encryptedSha256,
      'The file on Walrus differs from the certified one',
    );
  }

  return checks;
}

/** A certificate is valid when no check failed */
export function isCertificateValid(checks: CertificateCheck[]): boolean {
  return checks.length > 0 && checks.every((c) => c.status !== 'fail');
}
