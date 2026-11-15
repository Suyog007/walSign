import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Link } from 'react-router-dom';
import { AlertCircle, Award, CheckCircle, FileCheck, HelpCircle, Loader, ShieldAlert, ShieldCheck, XCircle } from 'lucide-react';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useCertificateVerification } from '../hooks/useCertificate';
import { CheckStatus } from '../services/certificateService';
import { formatAddress } from '../utils/addressUtils';

const STATUS_ICONS: Record<CheckStatus, JSX.Element> = {
  pass: <CheckCircle className="w-5 h-5 text-green-600" aria-label="passed" />,
  fail: <XCircle className="w-5 h-5 text-red-600" aria-label="failed" />,
  unavailable: <HelpCircle className="w-5 h-5 text-gray-400" aria-label="unavailable" />,
};

function PdfDrop({ label, hint, onFile, disabled }: { label: string; hint: string; onFile: (file: File) => void; disabled?: boolean }) {
  const onDrop = useCallback((files: File[]) => files[0] && onFile(files[0]), [onFile]);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    multiple: false,
    disabled,
  });
  return (
    <div
      {...getRootProps()}
      className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition ${
        isDragActive ? 'border-primary bg-primary/5' : 'border-gray-300 hover:bg-gray-50'
      }`}
    >
      <input {...getInputProps()} aria-label={label} />
      <p className="font-medium text-gray-900">{label}</p>
      <p className="mt-1 text-sm text-gray-500">{hint}</p>
    </div>
  );
}

export function CertificateVerifyPage() {
  const { verify, compareDocument, reset, result, documentMatch, isVerifying, error } = useCertificateVerification();

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="text-center space-y-2">
        <h2 className="text-4xl font-bold text-white drop-shadow-lg">Verify Certificate</h2>
        <p className="text-white/80 text-lg">
          Check a WalSign completion certificate against the Sui blockchain and Walrus
        </p>
      </div>

      <Card className="max-w-3xl mx-auto">
        <CardBody className="p-6 space-y-4">
          {!result && !isVerifying && (
            <PdfDrop label="Drop a certificate PDF here" hint="or click to choose the file" onFile={verify} />
          )}

          {isVerifying && (
            <div className="flex items-center justify-center gap-2 py-8 text-gray-600">
              <Loader className="w-5 h-5 animate-spin" />
              Checking the certificate against chain data...
            </div>
          )}

          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}
        </CardBody>
      </Card>

      {result && (
        <Card className="max-w-3xl mx-auto">
          <CardHeader>
            <div
              className={`flex items-center gap-3 ${result.valid ? 'text-green-700' : 'text-red-700'}`}
              role="status"
            >
              {result.valid ? <ShieldCheck className="w-8 h-8" /> : <ShieldAlert className="w-8 h-8" />}
              <div>
                <h3 className="text-lg font-semibold">
                  {result.valid ? 'Certificate is valid' : 'Certificate does not match the chain'}
                </h3>
                <p className="text-sm text-gray-600">
                  “{result.certificate.title}” · {result.certificate.signers.length} signer(s) · completed{' '}
                  {new Date(result.certificate.completedAt).toLocaleString()}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardBody className="space-y-5">
            <ul className="space-y-2" aria-label="Checks">
              {result.checks.map((check) => (
                <li key={check.label} className="flex items-start gap-3">
                  {STATUS_ICONS[check.status]}
                  <div className="text-sm">
                    <p className="font-medium">{check.label}</p>
                    {check.detail && <p className="text-xs text-gray-600 break-all">{check.detail}</p>}
                  </div>
                </li>
              ))}
            </ul>

            <div className="rounded-lg bg-gray-50 p-4 text-xs space-y-1">
              <p className="flex items-center gap-1 font-semibold text-gray-700">
                <Award className="w-4 h-4" /> Signers
              </p>
              {result.certificate.signers.map((signer) => (
                <p key={signer.address} className="font-mono text-gray-600" title={signer.address}>
                  {formatAddress(signer.address)} · {new Date(signer.signedAt).toLocaleString()}
                </p>
              ))}
            </div>

            {result.certificate.documentSha256 && (
              <div className="space-y-2">
                <p className="text-sm font-medium flex items-center gap-2">
                  <FileCheck className="w-4 h-4" /> Compare a signed PDF (optional)
                </p>
                <PdfDrop
                  label="Drop the signed PDF"
                  hint="It is hashed in your browser and never uploaded"
                  onFile={compareDocument}
                />
                {documentMatch === true && (
                  <p className="text-sm text-green-700">This PDF is exactly the certified document.</p>
                )}
                {documentMatch === false && (
                  <p className="text-sm text-red-700">This PDF differs from the certified document.</p>
                )}
              </div>
            )}

            <div className="flex justify-between">
              <Link to={`/verify/${result.certificate.documentId}`} className="text-sm text-primary hover:underline">
                View document details
              </Link>
              <Button variant="outline" size="sm" onClick={reset}>
                Verify another certificate
              </Button>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
