import { useCallback, useState } from 'react';
import { PACKAGE_ID, SUI_NETWORK, suiClient } from '../config/seal.config';
import { getAuditTrail } from '../services/auditService';
import {
  buildCertificateData,
  CertificateCheck,
  CertificateData,
  generateCertificatePdf,
  isCertificateValid,
  readCertificatePdf,
  verifyCertificate,
} from '../services/certificateService';
import { DocumentSummary, getDocumentDetails, getLatestBlobId } from '../services/registryService';
import { downloadFromWalrus } from '../services/walrusService';
import { downloadBytes } from '../utils/download';
import { sha256Hex } from '../utils/hash';

const errorMessage = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

/** Issues the completion certificate of a fully signed document as a PDF download */
export function useCertificate() {
  const [isIssuing, setIsIssuing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** `signedPdf` is the decrypted final PDF, if the user has it open; its hash is added to the certificate */
  const issue = useCallback(async (document: DocumentSummary, signedPdf?: Blob | null) => {
    setIsIssuing(true);
    setError(null);
    try {
      const [trail, encrypted] = await Promise.all([
        getAuditTrail(suiClient, document.documentId),
        downloadFromWalrus(getLatestBlobId(document)),
      ]);
      const data = buildCertificateData(document, trail, {
        network: SUI_NETWORK,
        packageId: PACKAGE_ID,
        encryptedSha256: await sha256Hex(encrypted),
        documentSha256: signedPdf ? await sha256Hex(await signedPdf.arrayBuffer()) : undefined,
        issuedAt: Date.now(),
      });
      const pdf = await generateCertificatePdf(data);
      const safeTitle = document.title.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'document';
      downloadBytes(pdf, `${safeTitle}-certificate.pdf`);
      return true;
    } catch (err) {
      setError(errorMessage(err, 'Failed to issue the certificate'));
      return false;
    } finally {
      setIsIssuing(false);
    }
  }, []);

  return { issue, isIssuing, error };
}

export interface VerificationResult {
  certificate: CertificateData;
  checks: CertificateCheck[];
  valid: boolean;
}

/** Reads a certificate PDF and checks it against chain and Walrus data */
export function useCertificateVerification() {
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [documentMatch, setDocumentMatch] = useState<boolean | null>(null);

  const verify = useCallback(async (file: File) => {
    setIsVerifying(true);
    setError(null);
    setResult(null);
    setDocumentMatch(null);
    try {
      const certificate = await readCertificatePdf(new Uint8Array(await file.arrayBuffer()));
      const [document, trail, encryptedSha256] = await Promise.all([
        getDocumentDetails(suiClient, certificate.documentId),
        getAuditTrail(suiClient, certificate.documentId),
        downloadFromWalrus(certificate.finalBlobId)
          .then(sha256Hex)
          .catch(() => null),
      ]);
      const checks = verifyCertificate(certificate, { document, trail, encryptedSha256 });
      setResult({ certificate, checks, valid: isCertificateValid(checks) });
    } catch (err) {
      setError(errorMessage(err, 'Failed to verify the certificate'));
    } finally {
      setIsVerifying(false);
    }
  }, []);

  /** Compare a (decrypted) signed PDF with the hash stated in the certificate */
  const compareDocument = useCallback(
    async (file: File) => {
      const expected = result?.certificate.documentSha256;
      if (!expected) return;
      setDocumentMatch((await sha256Hex(await file.arrayBuffer())) === expected);
    },
    [result],
  );

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setDocumentMatch(null);
  }, []);

  return { verify, compareDocument, reset, result, documentMatch, isVerifying, error };
}
