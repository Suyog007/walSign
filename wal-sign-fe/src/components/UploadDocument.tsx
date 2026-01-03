'use client';
import { useCallback, useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import toast from 'react-hot-toast';
import { Button } from './ui/Button';
import { Card, CardBody, CardHeader } from './ui/Card';
import { Input } from './ui/Input';
import { isValidSuiAddress, getSignUrl } from '../utils/addressUtils';
import { useSuiWallet } from '../hooks/useSuiWallet';
import { Modal } from './ui/Modal';
import { DocumentViewer } from './DocumentViewer';
import { useDocumentUpload } from '../hooks/useDocumentUpload';

export function UploadDocument() {
  const { connected } = useSuiWallet();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [recipient, setRecipient] = useState('');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [openModal, setOpenModal] = useState(false);
  const [createdId, setCreatedId] = useState<string>('');
  const [walrusBlobId, setWalrusBlobId] = useState<string>('');
  const [txHash, setTxHash] = useState<string>('');
  const { uploadDocument, progress, isUploading, resetProgress } = useDocumentUpload();

  const onDrop = useCallback((accepted: File[]) => {
    const pdf = accepted.find((f) => f.type === 'application/pdf');
    if (pdf) setFile(pdf);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    multiple: false,
  });

  const canCreate = connected && !!file && !!title;

  const addRecipient = () => {
    if (!recipient) return;
    if (!isValidSuiAddress(recipient)) return;
    if (recipients.includes(recipient)) return;
    setRecipients((r) => [...r, recipient]);
    setRecipient('');
  };
  const removeRecipient = (addr: string) => setRecipients((r) => r.filter((x) => x !== addr));

  const fileInfo = useMemo(() => {
    if (!file) return null;
    const kb = (file.size / 1024).toFixed(1);
    return `${file.name} • ${kb} KB`;
  }, [file]);

  const onCreate = async () => {
    if (!file) return;
    try {
      console.log("tt");
      const res = await uploadDocument(file, title, recipients);
      console.log("hereeeeelklll");
      setCreatedId(res.documentId);
      setWalrusBlobId(res.walrusBlobId);
      setTxHash(res.txHash);
      setOpenModal(true);
    } catch {
      // handled via progress state
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <h3 className="font-semibold">Upload Document</h3>
        </CardHeader>
        <CardBody>
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 ${
              isDragActive 
                ? 'border-primary bg-primary/5 scale-[1.02]' 
                : file 
                ? 'border-green-400 bg-green-50' 
                : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
            }`}
          >
            <input {...getInputProps()} />
            <div className="flex flex-col items-center gap-3">
              {file ? (
                <>
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                    <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{fileInfo}</p>
                    <p className="text-sm text-gray-500 mt-1">Click or drag to replace</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
                    <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-base font-medium text-gray-900">
                      {isDragActive ? 'Drop your PDF here' : 'Drag & drop a PDF here'}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">or click to browse your files</p>
                  </div>
                  <p className="text-xs text-gray-400">PDF files only • Max 10MB</p>
                </>
              )}
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <Input label="Title" value={title} onChange={setTitle} placeholder="Document title" />
            <div>
              <label className="text-sm font-medium">Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" className="w-full rounded-lg border px-3 py-2 border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input label="Add Recipient" value={recipient} onChange={setRecipient} placeholder="0x..." className="flex-1" />
                <Button variant="outline" onClick={addRecipient}>Add</Button>
              </div>
              {recipients.length > 0 && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <label className="block text-xs font-semibold text-gray-600 mb-2">
                    Recipients ({recipients.length})
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {recipients.map((addr) => (
                      <span 
                        key={addr} 
                        className="inline-flex items-center gap-2 rounded-lg bg-white border border-gray-300 px-3 py-1.5 text-xs font-mono shadow-sm"
                        title={addr}
                      >
                        <span className="text-gray-700">
                          {addr.slice(0, 6)}...{addr.slice(-4)}
                        </span>
                        <button 
                          onClick={() => removeRecipient(addr)} 
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded p-0.5 transition-colors"
                          title="Remove recipient"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <Button 
              onClick={onCreate} 
              disabled={!canCreate || isUploading}
              className="w-full py-3 text-base font-semibold"
            >
              {isUploading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Processing...
                </>
              ) : (
                <>
                  <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Create Document
                </>
              )}
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="font-semibold">Preview</h3>
        </CardHeader>
        <CardBody>
          <DocumentViewer file={file ?? undefined} title={title || undefined} />
        </CardBody>
      </Card>

      <Modal 
        open={openModal} 
        onClose={() => { setOpenModal(false); resetProgress(); }} 
        title={
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">Document Created Successfully!</h3>
              <p className="text-sm text-gray-500">Your document is ready to be signed</p>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Document ID */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600 mb-2">
              Document ID
            </label>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded bg-white px-3 py-2 text-sm font-mono text-gray-800 border border-gray-200 break-all">
                {createdId}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(createdId);
                  toast.success('Document ID copied!');
                }}
                className="flex-shrink-0 rounded-lg bg-gray-200 p-2 hover:bg-gray-300 transition-colors"
                title="Copy Document ID"
              >
                <svg className="h-5 w-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          </div>

          {/* Walrus Blob ID */}
          {walrusBlobId && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600 mb-2">
                Walrus Blob ID
              </label>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-white px-3 py-2 text-sm font-mono text-gray-800 border border-gray-200 break-all">
                  {walrusBlobId}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(walrusBlobId);
                    toast.success('Blob ID copied!');
                  }}
                  className="flex-shrink-0 rounded-lg bg-gray-200 p-2 hover:bg-gray-300 transition-colors"
                  title="Copy Blob ID"
                >
                  <svg className="h-5 w-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Transaction Hash */}
          {txHash && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600 mb-2">
                Transaction Hash
              </label>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-white px-3 py-2 text-sm font-mono text-gray-800 border border-gray-200 break-all">
                  {txHash}
                </code>
                <a
                  href={`https://suiscan.xyz/testnet/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0 rounded-lg bg-blue-100 p-2 hover:bg-blue-200 transition-colors"
                  title="View on Explorer"
                >
                  <svg className="h-5 w-5 text-blue-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            </div>
          )}

          {/* Shareable Link */}
          {createdId && (
            <div className="rounded-lg border-2 border-primary/20 bg-primary/5 p-4">
              <label className="block text-xs font-semibold uppercase tracking-wide text-primary mb-2">
                📧 Shareable Signing Link
              </label>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-white px-3 py-2 text-sm font-mono text-primary border border-primary/30 break-all">
                  {getSignUrl(createdId, false) || 'Generating link...'}
                </code>
                <button
                  onClick={() => {
                    const url = getSignUrl(createdId, false);
                    if (url) {
                      navigator.clipboard.writeText(url);
                      toast.success('Link copied to clipboard!');
                    }
                  }}
                  className="flex-shrink-0 rounded-lg bg-primary p-2 hover:bg-primary/90 transition-colors"
                  title="Copy Link"
                  disabled={!createdId}
                >
                  <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button 
              variant="outline" 
              onClick={() => {
                const url = getSignUrl(createdId, false);
                if (url) {
                  navigator.clipboard.writeText(url);
                  toast.success('Link copied to clipboard!');
                }
              }}
              className="flex-1"
              disabled={!createdId}
            >
              <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              Copy Link
            </Button>
            <a href={`/sign/${createdId}`} className="flex-1">
              <Button className="w-full">
                <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                View Document
              </Button>
            </a>
          </div>

          {/* Success Message */}
          <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-800">
            <p className="font-medium">✅ Next Steps:</p>
            <ul className="mt-1 space-y-1 list-disc list-inside text-green-700">
              <li>Share the link with signers</li>
              <li>Track signatures on the dashboard</li>
              <li>Download signed document when complete</li>
            </ul>
          </div>
        </div>
      </Modal>

      {/* Progress Modal - Centered on Screen */}
      {isUploading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-2xl mx-4">
            <div className="rounded-2xl border-2 border-primary/30 bg-white p-8 shadow-2xl">
              <div className="flex items-start gap-6 mb-4">
                {/* Animated Icon based on stage */}
                <div className="flex-shrink-0">
                  {progress.stage === 'encrypting' && (
                    <div className="relative h-20 w-20">
                      {/* Lock Animation */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <svg className="h-20 w-20 text-primary animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      </div>
                      {/* Sparkles around lock */}
                      <div className="absolute top-0 right-0 h-3 w-3 rounded-full bg-yellow-400 animate-ping" />
                      <div className="absolute bottom-0 left-0 h-3 w-3 rounded-full bg-yellow-400 animate-ping" style={{ animationDelay: '0.3s' }} />
                    </div>
                  )}
                  {progress.stage === 'uploading' && (
                    <div className="relative h-20 w-20">
                      {/* Mailbox Animation */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <svg className="h-20 w-20 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      </div>
                      {/* Animated letter going in */}
                      <div className="absolute top-0 left-1/2 -translate-x-1/2">
                        <svg className="h-6 w-6 text-blue-500 animate-[bounce_1s_ease-in-out_infinite]" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                          <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                        </svg>
                      </div>
                    </div>
                  )}
                  {progress.stage === 'recording' && (
                    <div className="relative h-20 w-20">
                      {/* Blockchain Recording Animation */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <svg className="h-20 w-20 text-primary animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      {/* Rotating dots */}
                      <div className="absolute inset-0 animate-spin">
                        <div className="h-3 w-3 rounded-full bg-green-400 absolute top-0 left-1/2 -translate-x-1/2" />
                      </div>
                      <div className="absolute inset-0 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }}>
                        <div className="h-3 w-3 rounded-full bg-blue-400 absolute bottom-0 left-1/2 -translate-x-1/2" />
                      </div>
                    </div>
                  )}
                  {progress.stage === 'issuing' && (
                    <div className="relative h-20 w-20">
                      {/* Key Animation */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <svg className="h-20 w-20 text-primary animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                        </svg>
                      </div>
                      {/* Sparkles */}
                      <div className="absolute top-2 right-2 h-2 w-2 rounded-full bg-yellow-300 animate-ping" />
                      <div className="absolute bottom-2 left-2 h-2 w-2 rounded-full bg-yellow-300 animate-ping" style={{ animationDelay: '0.2s' }} />
                      <div className="absolute top-2 left-2 h-2 w-2 rounded-full bg-yellow-300 animate-ping" style={{ animationDelay: '0.4s' }} />
                    </div>
                  )}
                  {progress.stage === 'complete' && (
                    <div className="relative h-20 w-20">
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="h-20 w-20 rounded-full bg-green-100 flex items-center justify-center animate-[scale-in_0.3s_ease-out]">
                          <svg className="h-12 w-12 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Progress Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-primary text-2xl capitalize">{progress.stage}</span>
                    <span className="font-bold text-primary text-4xl tabular-nums">{progress.progress}%</span>
                  </div>
                  <div className="text-gray-700 font-medium text-lg">{progress.message}</div>
                </div>
              </div>

              {/* Animated Progress Bar */}
              <div className="relative mt-6 h-5 w-full rounded-full bg-gray-200 overflow-hidden shadow-inner">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-[shimmer_2s_infinite]" style={{ backgroundSize: '200% 100%' }} />
                <div 
                  className="relative h-5 rounded-full bg-gradient-to-r from-primary via-primary/90 to-primary transition-all duration-500 ease-out overflow-hidden" 
                  style={{ width: `${progress.progress}%` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[slide_1s_linear_infinite]" style={{ backgroundSize: '50px 100%' }} />
                </div>
              </div>

              {/* Stage Indicators */}
              <div className="flex items-center justify-between mt-6 text-sm">
                <div className={`flex items-center gap-2 ${progress.stage === 'encrypting' ? 'text-primary font-semibold' : 'text-gray-400'}`}>
                  <div className={`h-2 w-2 rounded-full ${progress.stage === 'encrypting' ? 'bg-primary animate-pulse' : 'bg-gray-300'}`} />
                  <span>Encrypt</span>
                </div>
                <div className={`flex items-center gap-2 ${progress.stage === 'uploading' ? 'text-primary font-semibold' : 'text-gray-400'}`}>
                  <div className={`h-2 w-2 rounded-full ${progress.stage === 'uploading' ? 'bg-primary animate-pulse' : 'bg-gray-300'}`} />
                  <span>Upload</span>
                </div>
                <div className={`flex items-center gap-2 ${progress.stage === 'recording' ? 'text-primary font-semibold' : 'text-gray-400'}`}>
                  <div className={`h-2 w-2 rounded-full ${progress.stage === 'recording' ? 'bg-primary animate-pulse' : 'bg-gray-300'}`} />
                  <span>Record</span>
                </div>
                <div className={`flex items-center gap-2 ${progress.stage === 'issuing' || progress.stage === 'complete' ? 'text-primary font-semibold' : 'text-gray-400'}`}>
                  <div className={`h-2 w-2 rounded-full ${progress.stage === 'issuing' || progress.stage === 'complete' ? 'bg-primary animate-pulse' : 'bg-gray-300'}`} />
                  <span>Issue</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


