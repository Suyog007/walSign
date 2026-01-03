import { useParams, useSearchParams } from 'react-router-dom';
import { Input } from '../components/ui/Input';
import { useState, useEffect } from 'react';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { AddressDisplay } from '../components/ui/AddressDisplay';
import { getDocumentDetails, DocumentSummary, getLatestBlobId } from '../services/registryService';
import { suiClient } from '../config/seal.config';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { DocumentViewer } from '../components/DocumentViewer';
import { useDocumentDecryption } from '../hooks/useDocumentDecryption';
import { 
  FileText, 
  CheckCircle, 
  Clock, 
  Users, 
  Calendar,
  Shield,
  Lock,
  Unlock,
  Loader,
  AlertCircle,
  ExternalLink
} from 'lucide-react';

export function VerifyPage() {
  const params = useParams();
  const [search] = useSearchParams();
  const currentAccount = useCurrentAccount();
  const fromParam = params.documentId || search.get('documentId') || '';
  
  const [documentId, setDocumentId] = useState(fromParam);
  const [document, setDocument] = useState<DocumentSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decryptedFile, setDecryptedFile] = useState<File | null>(null);
  
  const { 
    decryptDocument, 
    isDecrypting, 
    error: decryptionError
  } = useDocumentDecryption();

  // Fetch document details when documentId changes
  useEffect(() => {
    if (documentId && documentId.trim()) {
      fetchDocumentDetails(documentId);
    }
  }, [documentId]);

  const fetchDocumentDetails = async (docId: string) => {
    setIsLoading(true);
    setError(null);
    setDocument(null);
    
    try {
      const doc = await getDocumentDetails(suiClient, docId);
      if (!doc) {
        setError('Document not found. Please check the document ID.');
      } else {
        setDocument(doc);
      }
    } catch (err) {
      console.error('Error fetching document:', err);
      setError('Failed to fetch document details. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = () => {
    if (documentId.trim()) {
      fetchDocumentDetails(documentId.trim());
    }
  };

  const handleDecrypt = async () => {
    if (!document || !currentAccount) return;
    
    setDecryptedFile(null);
    setError(null);
    
    try {
      // Get the latest blob ID (from signed_blob_id vector if exists)
      const blobIdToDecrypt = getLatestBlobId(document);
      
      if (!blobIdToDecrypt || blobIdToDecrypt.trim() === '') {
        setError('Document has no Walrus blob ID yet');
        return;
      }
      
      // Decrypt using the hook
      const pdfBlob = await decryptDocument(document.documentId, blobIdToDecrypt);
      
      if (pdfBlob) {
        // Convert Blob to File for DocumentViewer
        const pdfFile = new File([pdfBlob], `${document.title || 'document'}.pdf`, {
          type: 'application/pdf',
        });
        setDecryptedFile(pdfFile);
      } else {
        setError(decryptionError || 'Failed to decrypt document');
      }
    } catch (err) {
      console.error('Decryption error:', err);
      setError(err instanceof Error ? err.message : 'Failed to decrypt document');
    }
  };

  const canDecrypt = currentAccount && document && (
    document.authorizedSigners.includes(currentAccount.address) ||
    document.creator === currentAccount.address
  );

  // Calculate status
  const getStatusInfo = (doc: DocumentSummary) => {
    const uniqueSigners = new Set(doc.authorizedSigners).size;
    const signatureCount = doc.signatures.length;
    
    if (signatureCount === 0) {
      return {
        label: 'Pending Signatures',
        color: 'text-red-600',
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200',
        icon: <Clock className="w-5 h-5" />
      };
    } else if (signatureCount < uniqueSigners) {
      return {
        label: 'Partially Signed',
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-50',
        borderColor: 'border-yellow-200',
        icon: <Clock className="w-5 h-5" />
      };
    } else {
      return {
        label: 'Fully Signed',
        color: 'text-green-600',
        bgColor: 'bg-green-50',
        borderColor: 'border-green-200',
        icon: <CheckCircle className="w-5 h-5" />
      };
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-4xl font-bold text-white drop-shadow-lg">Verify Document</h2>
        <p className="text-white/80 text-lg">Enter a document ID to verify signatures and view details</p>
      </div>

      {/* Search Box */}
      <Card className="max-w-3xl mx-auto">
        <CardBody className="p-6">
          <div className="flex gap-3">
            <Input 
              value={documentId} 
              onChange={setDocumentId} 
              placeholder="Enter document ID (0x...)" 
              className="flex-1 font-mono"
              disabled={isLoading}
            />
            <Button 
              variant="primary" 
              onClick={handleVerify}
              disabled={!documentId.trim() || isLoading}
              className="px-8"
            >
              {isLoading ? (
                <>
                  <Loader className="w-4 h-4 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  <Shield className="w-4 h-4 mr-2" />
                  Verify
                </>
              )}
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Error State */}
      {error && (
        <Card className="max-w-3xl mx-auto border-2 border-red-200">
          <CardBody className="p-6">
            <div className="flex items-center gap-3 text-red-600">
              <AlertCircle className="w-6 h-6 flex-shrink-0" />
              <div>
                <p className="font-semibold">Error</p>
                <p className="text-sm">{error}</p>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Document Details */}
      {document && (
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Document Information */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <FileText className="w-6 h-6 text-primary" />
                <h3 className="text-xl font-semibold">Document Information</h3>
              </div>
            </CardHeader>
            <CardBody className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Title</p>
                  <p className="font-semibold text-gray-900">{document.title}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Document ID</p>
                  <p className="font-mono text-sm text-gray-900 break-all">{document.documentId}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Creator</p>
                  <AddressDisplay address={document.creator} />
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Created</p>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <p className="text-sm text-gray-900">{formatDate(document.createdAt)}</p>
                  </div>
                </div>
              </div>
              {document.description && (
                <div>
                  <p className="text-sm text-gray-600 mb-1">Description</p>
                  <p className="text-gray-900">{document.description}</p>
                </div>
              )}
              <div>
                <p className="text-sm text-gray-600 mb-1">
                  Walrus Blob ID
                  {document.signedBlobIds && document.signedBlobIds.length > 0 && (
                    <span className="ml-2 px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
                      {document.signedBlobIds.length + 1} version{document.signedBlobIds.length > 0 ? 's' : ''}
                    </span>
                  )}
                </p>
                <div className="space-y-2">
                  {/* Latest/Current Blob ID */}
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-sm bg-green-50 border border-green-200 px-3 py-2 rounded break-all">
                      {getLatestBlobId(document)}
                      {document.signedBlobIds && document.signedBlobIds.length > 0 && (
                        <span className="ml-2 text-xs text-green-600 font-semibold">(Latest - Signed)</span>
                      )}
                    </code>
                    <a
                      href={`https://aggregator.walrus-testnet.walrus.space/v1/blobs/${getLatestBlobId(document)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 hover:bg-gray-100 rounded transition-colors"
                      title="View on Walrus"
                    >
                      <ExternalLink className="w-4 h-4 text-gray-600" />
                    </a>
                  </div>
                  
                  {/* Original Blob ID (if different from latest) */}
                  {document.signedBlobIds && document.signedBlobIds.length > 0 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-gray-600 hover:text-gray-800">
                        View all versions
                      </summary>
                      <div className="mt-2 space-y-1 pl-4">
                        <div className="flex items-center gap-2">
                          <code className="flex-1 bg-gray-100 px-2 py-1 rounded break-all">
                            {document.walrusBlobId}
                          </code>
                          <span className="text-gray-500">(Original)</span>
                        </div>
                        {document.signedBlobIds.map((blobId, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <code className="flex-1 bg-gray-100 px-2 py-1 rounded break-all">
                              {blobId}
                            </code>
                            <span className="text-gray-500">(v{idx + 1})</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Verification Status */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Shield className="w-6 h-6 text-green-600" />
                <h3 className="text-xl font-semibold">Verification Status</h3>
              </div>
            </CardHeader>
            <CardBody>
              <div className="flex flex-wrap gap-3">
                <div className="flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-green-200 bg-green-50">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span className="font-semibold text-green-700">Document Verified on Blockchain</span>
                </div>
                <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 ${getStatusInfo(document).borderColor} ${getStatusInfo(document).bgColor}`}>
                  {getStatusInfo(document).icon}
                  <span className={`font-semibold ${getStatusInfo(document).color}`}>
                    {getStatusInfo(document).label}
                  </span>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-blue-200 bg-blue-50">
                  <Users className="w-5 h-5 text-blue-600" />
                  <span className="font-semibold text-blue-700">
                    {document.signatures.length}/{new Set(document.authorizedSigners).size} Signatures
                  </span>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Signatures */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Users className="w-6 h-6 text-primary" />
                  <h3 className="text-xl font-semibold">Authorized Signers & Signatures</h3>
                </div>
                <span className="text-sm text-gray-600">
                  {document.signatures.length} of {new Set(document.authorizedSigners).size} signed
                </span>
              </div>
            </CardHeader>
            <CardBody>
              <div className="space-y-3">
                {[...new Set(document.authorizedSigners)].map((signer) => {
                  const signature = document.signatures.find(sig => sig.signer === signer);
                  const hasSigned = !!signature;
                  
                  return (
                    <div 
                      key={signer} 
                      className={`flex items-center justify-between p-4 rounded-lg border-2 ${
                        hasSigned ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {hasSigned ? (
                          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                        ) : (
                          <Clock className="w-5 h-5 text-gray-400 flex-shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <AddressDisplay address={signer} />
                          {signature && (
                            <p className="text-xs text-gray-600 mt-1">
                              Signed: {formatDate(signature.signedAt)}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        {hasSigned ? (
                          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                            Signed
                          </span>
                        ) : (
                          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-200 text-gray-600">
                            Pending
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardBody>
          </Card>

          {/* Decrypt & View */}
          {currentAccount && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  {canDecrypt ? (
                    <Unlock className="w-6 h-6 text-green-600" />
                  ) : (
                    <Lock className="w-6 h-6 text-gray-400" />
                  )}
                  <h3 className="text-xl font-semibold">Document Access</h3>
                </div>
              </CardHeader>
              <CardBody>
                {canDecrypt ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-4 bg-green-50 border-2 border-green-200 rounded-lg">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      <p className="text-green-700 font-medium">
                        You have access to decrypt this document
                      </p>
                    </div>
                    <Button
                      onClick={handleDecrypt}
                      disabled={isDecrypting || !!decryptedFile}
                      className="w-full"
                    >
                      {isDecrypting ? (
                        <>
                          <Loader className="w-4 h-4 mr-2 animate-spin" />
                          Decrypting...
                        </>
                      ) : decryptedFile ? (
                        <>
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Decrypted Successfully
                        </>
                      ) : (
                        <>
                          <Unlock className="w-4 h-4 mr-2" />
                          Decrypt & View PDF
                        </>
                      )}
                    </Button>
                    {decryptionError && (
                      <div className="p-4 bg-red-50 border-2 border-red-200 rounded-lg">
                        <p className="text-red-700 text-sm">{decryptionError}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-4 bg-gray-50 border-2 border-gray-200 rounded-lg">
                    <Lock className="w-5 h-5 text-gray-600" />
                    <p className="text-gray-700">
                      {currentAccount 
                        ? 'You do not have permission to decrypt this document'
                        : 'Connect your wallet to decrypt (if authorized)'}
                    </p>
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          {/* PDF Viewer */}
          {decryptedFile && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <FileText className="w-6 h-6 text-primary" />
                  <h3 className="text-xl font-semibold">Document Preview</h3>
                </div>
              </CardHeader>
              <CardBody>
                <DocumentViewer file={decryptedFile} title={document.title} />
              </CardBody>
            </Card>
          )}
        </div>
      )}

      {/* Empty State */}
      
    </div>
  );
}
