import { useParams, useSearchParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useCurrentAccount, useSignAndExecuteTransactionBlock } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { DocumentViewer } from '../components/DocumentViewer';
import { AddressDisplay } from '../components/ui/AddressDisplay';
import { Button } from '../components/ui/Button';
import { suiClient, PACKAGE_ID } from '../config/seal.config';
import { getDocumentDetails, DocumentSummary, getLatestBlobId } from '../services/registryService';
import { downloadFromWalrus, uploadToWalrus } from '../services/walrusService';
import { useDocumentDecryption } from '../hooks/useDocumentDecryption';
import { encryptPDF } from '../services/documentService';
import { PdfSignatureEditor } from '../components/PdfSignatureEditor';
import { Loader, CheckCircle, AlertCircle, FileText, Users, Calendar, Edit, Lock, Upload, Key, Shield } from 'lucide-react';
import toast from 'react-hot-toast';

interface SignProgress {
  stage: 'idle' | 'encrypting' | 'uploading' | 'finding' | 'updating' | 'recording' | 'complete' | 'error';
  message: string;
  progress: number;
}

export function SignPage() {
  const { documentId: paramDocId } = useParams();
  const [searchParams] = useSearchParams();
  let documentId = paramDocId || searchParams.get('documentId') || '';
  
  // Clean up document ID - remove any whitespace or invalid characters
  documentId = documentId.trim();
  
  const currentAccount = useCurrentAccount();
  const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransactionBlock();
  const { decryptDocument, isDecrypting } = useDocumentDecryption();
  
  const [document, setDocument] = useState<DocumentSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [isSigning, setIsSigning] = useState(false);
  const [signSuccess, setSignSuccess] = useState(false);
  const [txHash, setTxHash] = useState<string>('');
  const [decryptionError, setDecryptionError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isProcessingSignature, setIsProcessingSignature] = useState(false);
  const [signProgress, setSignProgress] = useState<SignProgress>({
    stage: 'idle',
    message: '',
    progress: 0,
  });

  // Fetch document details
  useEffect(() => {
    async function fetchDocument() {
      if (!documentId) {
        setError('No document ID provided. Please check the URL and try again.');
        setIsLoading(false);
        return;
      }

      // Validate document ID format (should be a Sui object ID)
      if (!documentId.startsWith('0x') || documentId.length < 40) {
        setError(`Invalid document ID format: "${documentId}". Document IDs should start with "0x" and be at least 40 characters long.`);
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        const doc = await getDocumentDetails(suiClient, documentId);
        if (doc) {
          setDocument(doc);
        } else {
          setError(`Document not found: ${documentId}. Please verify the document ID is correct.`);
        }
      } catch (err) {
        console.error('Error fetching document:', err);
        setError(err instanceof Error ? err.message : 'Failed to load document. Please check the document ID and try again.');
      } finally {
        setIsLoading(false);
      }
    }

    fetchDocument();
  }, [documentId]);

  // Manual decrypt function - triggered by button click
  const handleDecrypt = async () => {
    if (!document || !currentAccount) {
      setDecryptionError('Wallet not connected');
      return;
    }

    // Get the latest blob ID (from signed_blob_id vector if exists)
    const blobIdToDecrypt = getLatestBlobId(document);

    // Check if blob ID exists
    if (!blobIdToDecrypt || blobIdToDecrypt.trim() === '') {
      setDecryptionError('Document has no Walrus blob ID yet');
      return;
    }

    if (isDecrypting) {
      return; // Already decrypting
    }

    setDecryptionError(null);

    try {
      // Show which version we're decrypting
      if (document.signedBlobIds && document.signedBlobIds.length > 0) {
        toast(`📄 Decrypting latest signed version (${document.signedBlobIds.length + 1} versions available)`, {
          duration: 3000,
          icon: '🔓'
        });
      }
      
      const blob = await decryptDocument(document.documentId, blobIdToDecrypt);
      
      if (blob) {
        setPdfBlob(blob);
      } else {
        setDecryptionError('Failed to decrypt PDF - you may not have access to this document');
      }
    } catch (err) {
      console.error('Error decrypting PDF:', err);
      setDecryptionError(err instanceof Error ? err.message : 'Failed to decrypt PDF');
    }
  };

  const handleSaveSignedPdf = async (signedPdfBlob: Blob, signaturePositions: any[]) => {
    if (!document || !currentAccount) return;
    
    setIsProcessingSignature(true);
    setIsEditing(false);
    
    // Initialize progress
    setSignProgress({
      stage: 'encrypting',
      message: 'Encrypting signed PDF with Seal...',
      progress: 10,
    });
    
    try {
      // Step 1: Encrypt the signed PDF (same as document creation)
      const signedPdfFile = new File([signedPdfBlob], `${document.title}-signed.pdf`, { 
        type: 'application/pdf' 
      });
      
      const { encryptedData } = await encryptPDF(
        PACKAGE_ID,
        document.documentId,
        signedPdfFile
      );
      
      if (!encryptedData) {
        throw new Error('Failed to encrypt signed PDF');
      }
      
      // Step 2: Upload encrypted signed PDF to Walrus
      setSignProgress({
        stage: 'uploading',
        message: 'Uploading encrypted signed PDF to Walrus...',
        progress: 40,
      });
      
      const signedBlobId = await uploadToWalrus(encryptedData, 200);
      
      if (!signedBlobId) {
        throw new Error('Failed to upload signed PDF to Walrus');
      }
      
      // Step 3: Find SignerCap
      setSignProgress({
        stage: 'finding',
        message: 'Finding your signing capability...',
        progress: 60,
      });
      
      let signerCapId: string | null = null;
      let cursor: string | null | undefined = null;
      
      do {
        const ownedObjects = await suiClient.getOwnedObjects({
          owner: currentAccount.address,
          cursor,
          limit: 50,
          options: {
            showContent: true,
            showType: true,
          },
        });

        for (const obj of ownedObjects.data) {
          if (!obj.data) continue;
          
          const objectType = obj.data.type;
          if (objectType && objectType.includes(`${PACKAGE_ID}::wal_sign::SignerCap`)) {
            const content = obj.data.content;
            if (content && 'fields' in content) {
              const fields = content.fields as any;
              if (fields.document_id === document.documentId) {
                signerCapId = obj.data.objectId;
                break;
              }
            }
          }
        }

        if (signerCapId) break;
        cursor = ownedObjects.nextCursor;
      } while (cursor);

      if (!signerCapId) {
        throw new Error('SignerCap not found! You may not be authorized to sign this document.');
      }
      
      // Step 4: Update signed_blob_id vector on blockchain
      setSignProgress({
        stage: 'updating',
        message: 'Updating signed blob ID on blockchain...',
        progress: 75,
      });
      
      const updateSignedBlobTx = new Transaction() as any;
      updateSignedBlobTx.moveCall({
        target: `${PACKAGE_ID}::wal_sign::update_signed_blob_id`,
        arguments: [
          updateSignedBlobTx.object(signerCapId),
          updateSignedBlobTx.object(document.documentId),
          updateSignedBlobTx.pure.string(signedBlobId),
        ],
      });
      
      await new Promise<void>((resolve, reject) => {
        signAndExecuteTransaction(
          {
            transactionBlock: updateSignedBlobTx,
            options: {
              showEffects: true,
            },
          },
          {
            onSuccess: () => {
              resolve();
            },
            onError: (err) => {
              console.error('Failed to update signed blob ID:', err);
              reject(err);
            },
          }
        );
      });
      
      // Step 5: Record signature on blockchain
      setSignProgress({
        stage: 'recording',
        message: 'Recording signature on blockchain...',
        progress: 90,
      });
      
      await handleSign();
      
      // Step 6: Refresh document and decrypt latest version
      setSignProgress({
        stage: 'complete',
        message: 'Document signed successfully!',
        progress: 100,
      });
      
      // Refresh document to get updated signed_blob_id
      const updatedDoc = await getDocumentDetails(suiClient, document.documentId);
      if (updatedDoc) {
        setDocument(updatedDoc);
        
        // Decrypt the latest signed version to show in viewer
        try {
          const latestBlobId = getLatestBlobId(updatedDoc);
          const newPdfBlob = await decryptDocument(updatedDoc.documentId, latestBlobId);
          if (newPdfBlob) {
            setPdfBlob(newPdfBlob);
          }
        } catch (err) {
          // Don't throw - signing was successful
        }
      }
      
      // Close progress modal after a delay
      setTimeout(() => {
        setSignProgress({ stage: 'idle', message: '', progress: 0 });
        setIsProcessingSignature(false);
      }, 2000);
      
    } catch (error) {
      console.error('Error processing signed PDF:', error);
      setSignProgress({
        stage: 'error',
        message: error instanceof Error ? error.message : 'Failed to process signed document',
        progress: 0,
      });
      setError(error instanceof Error ? error.message : 'Failed to process signed document');
      
      // Close error modal after delay
      setTimeout(() => {
        setSignProgress({ stage: 'idle', message: '', progress: 0 });
        setIsProcessingSignature(false);
      }, 3000);
    }
  };

  const handleSign = async () => {
    if (!document || !currentAccount) return;

    setIsSigning(true);
    setError(null);

    try {
      // Query all objects owned by the user to find the SignerCap (with pagination)
      let signerCapId: string | null = null;
      let cursor: string | null | undefined = null;
      let totalObjects = 0;
      let pageCount = 0;

      // Loop through all pages of owned objects
      do {
        pageCount++;
        
        const ownedObjects = await suiClient.getOwnedObjects({
          owner: currentAccount.address,
          cursor,
          limit: 50, // Max 50 objects per page
          options: {
            showContent: true,
            showType: true,
          },
        });

        totalObjects += ownedObjects.data.length;

        // Search for SignerCap in this page
        for (const obj of ownedObjects.data) {
          // Skip if no data
          if (!obj.data) continue;
          
          const objectType = obj.data.type;
          
          // Check if this is a SignerCap object
          if (objectType && objectType.includes(`${PACKAGE_ID}::wal_sign::SignerCap`)) {
            const content = obj.data.content;
            
            if (content && 'fields' in content) {
              const fields = content.fields as any;
              
              // Check if the document_id field matches our document
              if (fields.document_id === document.documentId) {
                signerCapId = obj.data.objectId;
                break;
              }
            }
          }
        }

        // If found, break out of pagination loop
        if (signerCapId) break;

        // Update cursor for next page
        cursor = ownedObjects.nextCursor;
        
      } while (cursor); // Continue while there's a next page

      if (!signerCapId) {
        throw new Error(
          'SignerCap not found! You may not be authorized to sign this document, or the SignerCap was not issued to you.'
        );
      }

      const signTx = new Transaction();
      
      // Call sign_document function with the found SignerCap
      signTx.moveCall({
        target: `${PACKAGE_ID}::wal_sign::sign_document`,
        arguments: [
          signTx.object(document.documentId),
          signTx.object(signerCapId),
          signTx.object('0x6'), // Clock object
        ],
      });

      await new Promise<void>((resolve, reject) => {
        signAndExecuteTransaction(
          {
            transactionBlock: signTx as any,
            options: {
              showEffects: true,
              showEvents: true,
            },
          },
          {
            onSuccess: async (result: any) => {
              try {
                setTxHash(result.digest);
                setSignSuccess(true);
                
                // Refresh document data after a short delay
                setTimeout(async () => {
                  try {
                    const updated = await getDocumentDetails(suiClient, document.documentId);
                    if (updated) {
                      setDocument(updated);
                    }
                  } catch (refreshError) {
                    console.error('Error refreshing document:', refreshError);
                    // Don't throw - signing was successful even if refresh fails
                  }
                }, 2000);
                
                resolve();
              } catch (err) {
                console.error('Error in success handler:', err);
                // Still resolve since the signing itself was successful
                resolve();
              }
            },
            onError: (error: any) => {
              console.error('Failed to sign document:', error);
              setError(error.message || 'Failed to sign document');
              reject(error);
            },
          }
        );
      });
    } catch (err: any) {
      console.error('Sign error:', err);
      setError(err.message || 'Failed to sign document');
    } finally {
      setIsSigning(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader className="w-8 h-8 animate-spin mx-auto mb-3 text-blue-600" />
          <p className="text-gray-600">Loading document...</p>
        </div>
      </div>
    );
  }

  if (error && !document) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 mx-auto mb-3 text-red-600" />
          <p className="text-red-600 text-lg">{error}</p>
        </div>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-600">Document not found.</p>
      </div>
    );
  }

  const isAuthorized = currentAccount && document.authorizedSigners.includes(currentAccount.address);
  const alreadySigned = currentAccount && document.signatures.some(s => s.signer === currentAccount.address);
  const totalSigners = document.authorizedSigners.length;
  const signedCount = document.signatures.length;
  const signatureProgress = totalSigners > 0 ? (signedCount / totalSigners) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Sign Document</h2>
        {signSuccess && (
          <div className="flex items-center gap-2 text-green-600 bg-green-50 px-4 py-2 rounded-lg">
            <CheckCircle className="w-5 h-5" />
            <span className="font-medium">Successfully signed!</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Metadata */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <h3 className="font-semibold flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Document Details
            </h3>
          </CardHeader>
          <CardBody className="space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-500">Title</p>
              <p className="text-base font-semibold">{document.title}</p>
            </div>
            
            <div>
              <p className="text-sm font-medium text-gray-500">Description</p>
              <p className="text-sm">{document.description || 'No description'}</p>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-500 mb-1">Creator</p>
              <AddressDisplay address={document.creator} />
            </div>

            <div>
              <p className="text-sm font-medium text-gray-500 flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                Created
              </p>
              <p className="text-sm">{new Date(document.createdAt).toLocaleString()}</p>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-500 mb-2 flex items-center gap-1">
                <Users className="w-4 h-4" />
                Signature Progress
              </p>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{signedCount}/{totalSigners} signed</span>
                  <span>{Math.round(signatureProgress)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${signatureProgress}%` }}
                  ></div>
                </div>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-500 mb-2">Authorized Signers</p>
              <ul className="space-y-2">
                {document.authorizedSigners.map((addr) => {
                  const hasSigned = document.signatures.some(s => s.signer === addr);
                  return (
                    <li key={addr} className="flex items-center gap-2 text-xs">
                      {hasSigned ? (
                        <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border-2 border-gray-300 flex-shrink-0" />
                      )}
                      <span className="font-mono truncate">{addr}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </CardBody>
        </Card>

        {/* Middle Column: PDF Viewer */}
        <div className="lg:col-span-1">
          {isDecrypting ? (
            <Card>
              <CardBody>
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <Loader className="w-8 h-8 animate-spin mx-auto mb-3 text-blue-600" />
                    <p className="text-gray-600 mb-2">Decrypting PDF...</p>
                    <p className="text-sm text-gray-500">This may take a few moments</p>
                  </div>
                </div>
              </CardBody>
            </Card>
          ) : pdfBlob ? (
            <>
              {isEditing ? (
                <PdfSignatureEditor
                  pdfFile={new File([pdfBlob], `${document.title}.pdf`, { type: 'application/pdf' })}
                  onSave={handleSaveSignedPdf}
                  onCancel={() => setIsEditing(false)}
                />
              ) : (
                <>
                  <DocumentViewer 
                    file={new File([pdfBlob], `${document.title}.pdf`, { type: 'application/pdf' })} 
                    title={document.title} 
                  />
                </>
              )}
            </>
          ) : (
            <Card>
              <CardBody>
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                  <div className="text-center">
                    <FileText className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      Document Preview
                    </h3>
                    <p className="text-sm text-gray-600 mb-4">
                      Click the button below to decrypt and view the PDF
                    </p>
                  </div>

                  {decryptionError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 max-w-md">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-red-800">{decryptionError}</p>
                      </div>
                    </div>
                  )}

                  {!currentAccount ? (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 max-w-md">
                      <p className="text-sm text-yellow-800">
                        Please connect your wallet to decrypt and view this document.
                      </p>
                    </div>
                  ) : !document.walrusBlobId ? (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 max-w-md">
                      <p className="text-sm text-yellow-800">
                        Document is being uploaded. Please wait...
                      </p>
                    </div>
                  ) : (
                    <Button
                      onClick={handleDecrypt}
                      disabled={!currentAccount || isDecrypting}
                      variant="primary"
                      className="px-6 py-3"
                    >
                      {isDecrypting ? (
                        <>
                          <Loader className="w-5 h-5 animate-spin mr-2" />
                          Decrypting...
                        </>
                      ) : (
                        <>
                          <FileText className="w-5 h-5 mr-2" />
                          Decrypt & View PDF
                        </>
                      )}
                    </Button>
                  )}

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 max-w-md mt-4">
                    <p className="text-xs text-blue-800">
                      <strong>🔒 Privacy Note:</strong> The document is encrypted with Seal. 
                      Only authorized signers and the creator can decrypt and view it.
                    </p>
                  </div>
                </div>
              </CardBody>
            </Card>
          )}
        </div>

        {/* Right Column: Signing Controls */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <h3 className="font-semibold">Signing Controls</h3>
          </CardHeader>
          <CardBody className="space-y-4">
            {!currentAccount ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-yellow-800">
                  Please connect your wallet to sign this document.
                </p>
              </div>
            ) : !isAuthorized ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-800">
                  You are not authorized to sign this document.
                </p>
              </div>
            ) : alreadySigned ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <CheckCircle className="w-5 h-5 text-green-600 mb-2" />
                <p className="text-sm text-green-800 font-medium">
                  You have already signed this document.
                </p>
              </div>
            ) : (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800 mb-3">
                  You are authorized to sign this document.
                </p>
                {!pdfBlob ? (
                  <p className="text-sm text-gray-600">
                    Decrypt the document first to add your signature.
                  </p>
                ) : isEditing ? (
                  <div className="flex items-center gap-2 text-sm text-blue-700">
                    <Edit className="w-4 h-4" />
                    <span>Use the editor to add your signature</span>
                  </div>
                ) : isProcessingSignature ? (
                  <div className="text-center">
                    <Loader className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
                    <p className="text-sm text-blue-800">Processing signature...</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-blue-800 mb-3">
                      Ready to sign this document? Click the button below to add your signature.
                    </p>
                    <Button
                      onClick={() => setIsEditing(true)}
                      disabled={isProcessingSignature}
                      variant="primary"
                      className="w-full"
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      Sign Document
                    </Button>
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            {txHash && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="text-xs font-medium text-gray-700 mb-1">Transaction Hash:</p>
                <p className="text-xs font-mono break-all text-gray-600">{txHash}</p>
              </div>
            )}

            <div className="border-t pt-4">
              <h4 className="text-sm font-semibold mb-3">Signatures ({signedCount})</h4>
              {document.signatures.length === 0 ? (
                <p className="text-sm text-gray-500">No signatures yet</p>
              ) : (
                <ul className="space-y-2">
                  {document.signatures.map((sig, idx) => {
                    // Safety check: ensure sig.signer exists
                    if (!sig || !sig.signer) {
                      console.warn('Invalid signature data:', sig);
                      return null;
                    }
                    
                    return (
                      <li key={idx} className="text-xs">
                        <div className="flex items-center gap-2 mb-1">
                          <CheckCircle className="w-4 h-4 text-green-500" />
                          <span className="font-mono">
                            {sig.signer.slice(0, 10)}...{sig.signer.slice(-8)}
                          </span>
                        </div>
                        <p className="text-gray-500 ml-6">
                          {new Date(sig.signedAt).toLocaleString()}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Progress Modal - Centered on Screen */}
      {isProcessingSignature && signProgress.stage !== 'idle' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-2xl mx-4">
            <div className="rounded-2xl border-2 border-primary/30 bg-white p-8 shadow-2xl">
              <div className="flex items-start gap-6 mb-4">
                {/* Animated Icon based on stage */}
                <div className="flex-shrink-0">
                  {signProgress.stage === 'encrypting' && (
                    <div className="relative h-20 w-20">
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Lock className="h-20 w-20 text-primary animate-bounce" />
                      </div>
                      <div className="absolute top-0 right-0 h-3 w-3 rounded-full bg-yellow-400 animate-ping" />
                      <div className="absolute bottom-0 left-0 h-3 w-3 rounded-full bg-yellow-400 animate-ping" style={{ animationDelay: '0.3s' }} />
                    </div>
                  )}
                  {signProgress.stage === 'uploading' && (
                    <div className="relative h-20 w-20">
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Upload className="h-20 w-20 text-primary" />
                      </div>
                      <div className="absolute top-0 left-1/2 -translate-x-1/2">
                        <div className="h-6 w-6 text-blue-500 animate-[bounce_1s_ease-in-out_infinite]">
                          <FileText className="h-6 w-6" />
                        </div>
                      </div>
                    </div>
                  )}
                  {signProgress.stage === 'finding' && (
                    <div className="relative h-20 w-20">
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Key className="h-20 w-20 text-primary animate-pulse" />
                      </div>
                      <div className="absolute inset-0 animate-spin">
                        <div className="h-3 w-3 rounded-full bg-green-400 absolute top-0 left-1/2 -translate-x-1/2" />
                      </div>
                    </div>
                  )}
                  {signProgress.stage === 'updating' && (
                    <div className="relative h-20 w-20">
                      <div className="absolute inset-0 flex items-center justify-center">
                        <FileText className="h-20 w-20 text-primary animate-pulse" />
                      </div>
                      <div className="absolute inset-0 animate-spin">
                        <div className="h-3 w-3 rounded-full bg-green-400 absolute top-0 left-1/2 -translate-x-1/2" />
                      </div>
                    </div>
                  )}
                  {signProgress.stage === 'recording' && (
                    <div className="relative h-20 w-20">
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Shield className="h-20 w-20 text-primary animate-pulse" />
                      </div>
                      <div className="absolute inset-0 animate-spin">
                        <div className="h-3 w-3 rounded-full bg-green-400 absolute top-0 left-1/2 -translate-x-1/2" />
                      </div>
                    </div>
                  )}
                  {signProgress.stage === 'complete' && (
                    <div className="relative h-20 w-20">
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="h-20 w-20 rounded-full bg-green-100 flex items-center justify-center animate-[scale-in_0.3s_ease-out]">
                          <CheckCircle className="h-12 w-12 text-green-600" />
                        </div>
                      </div>
                    </div>
                  )}
                  {signProgress.stage === 'error' && (
                    <div className="relative h-20 w-20">
                      <div className="absolute inset-0 flex items-center justify-center">
                        <AlertCircle className="h-20 w-20 text-red-600" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Progress Info */}
                <div className="flex-1">
                  <div className="flex items-baseline gap-3 mb-2">
                    <span className="font-bold text-primary text-2xl capitalize">{signProgress.stage}</span>
                    <span className="font-bold text-primary text-4xl tabular-nums">{signProgress.progress}%</span>
                  </div>
                  <div className="text-gray-700 font-medium text-lg">{signProgress.message}</div>
                </div>
              </div>

              {/* Animated Progress Bar */}
              <div className="relative mt-6 h-5 w-full rounded-full bg-gray-200 overflow-hidden shadow-inner">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-[shimmer_2s_infinite]" style={{ backgroundSize: '200% 100%' }} />
                <div 
                  className="h-full bg-gradient-to-r from-primary to-primary/80 transition-all duration-500 ease-out rounded-full"
                  style={{ width: `${signProgress.progress}%` }}
                />
              </div>

              {/* Stage Indicators */}
              <div className="flex justify-between items-center mt-6 text-xs">
                <div className={`flex items-center gap-2 ${signProgress.stage === 'encrypting' ? 'text-primary font-semibold' : 'text-gray-400'}`}>
                  <div className={`h-2 w-2 rounded-full ${signProgress.stage === 'encrypting' ? 'bg-primary animate-pulse' : 'bg-gray-300'}`} />
                  <span>Encrypt</span>
                </div>
                <div className={`flex items-center gap-2 ${signProgress.stage === 'uploading' ? 'text-primary font-semibold' : 'text-gray-400'}`}>
                  <div className={`h-2 w-2 rounded-full ${signProgress.stage === 'uploading' ? 'bg-primary animate-pulse' : 'bg-gray-300'}`} />
                  <span>Upload</span>
                </div>
                <div className={`flex items-center gap-2 ${signProgress.stage === 'finding' ? 'text-primary font-semibold' : 'text-gray-400'}`}>
                  <div className={`h-2 w-2 rounded-full ${signProgress.stage === 'finding' ? 'bg-primary animate-pulse' : 'bg-gray-300'}`} />
                  <span>Find Cap</span>
                </div>
                <div className={`flex items-center gap-2 ${signProgress.stage === 'updating' ? 'text-primary font-semibold' : 'text-gray-400'}`}>
                  <div className={`h-2 w-2 rounded-full ${signProgress.stage === 'updating' ? 'bg-primary animate-pulse' : 'bg-gray-300'}`} />
                  <span>Update</span>
                </div>
                <div className={`flex items-center gap-2 ${signProgress.stage === 'recording' || signProgress.stage === 'complete' ? 'text-primary font-semibold' : 'text-gray-400'}`}>
                  <div className={`h-2 w-2 rounded-full ${signProgress.stage === 'recording' || signProgress.stage === 'complete' ? 'bg-primary animate-pulse' : 'bg-gray-300'}`} />
                  <span>Record</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


