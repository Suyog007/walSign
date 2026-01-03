import { useState } from 'react';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { downloadFromWalrus } from '../services/walrusService';
import { DocumentViewer } from '../components/DocumentViewer';
import { 
  Search, 
  Loader, 
  FileText, 
  AlertCircle, 
  Download,
  ExternalLink,
  CheckCircle,
  Copy
} from 'lucide-react';
import toast from 'react-hot-toast';

export function ViewBlobPage() {
  const [blobId, setBlobId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blobData, setBlobData] = useState<Uint8Array | null>(null);
  const [blobFile, setBlobFile] = useState<File | null>(null);
  const [contentType, setContentType] = useState<'pdf' | 'image' | 'text' | 'binary'>('binary');

  const handleFetch = async () => {
    if (!blobId.trim()) {
      toast.error('Please enter a blob ID');
      return;
    }

    setIsLoading(true);
    setError(null);
    setBlobData(null);
    setBlobFile(null);

    try {
      console.log('Fetching blob:', blobId);
      const data = await downloadFromWalrus(blobId.trim());
      
      console.log('Blob data received:', data.length, 'bytes');
      setBlobData(data);

      // Detect content type
      const detectedType = detectContentType(data);
      setContentType(detectedType);
      console.log('Detected content type:', detectedType);

      // Create file for PDF viewer
      if (detectedType === 'pdf') {
        const file = new File([new Uint8Array(data)], 'document.pdf', { type: 'application/pdf' });
        setBlobFile(file);
      }

      toast.success('Blob fetched successfully!');
    } catch (err) {
      console.error('Error fetching blob:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch blob';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const detectContentType = (data: Uint8Array): 'pdf' | 'image' | 'text' | 'binary' => {
    // Check magic bytes
    if (data.length < 4) return 'binary';

    // PDF: %PDF (0x25 0x50 0x44 0x46)
    if (data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46) {
      return 'pdf';
    }

    // PNG: 89 50 4E 47
    if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4E && data[3] === 0x47) {
      return 'image';
    }

    // JPEG: FF D8 FF
    if (data[0] === 0xFF && data[1] === 0xD8 && data[2] === 0xFF) {
      return 'image';
    }

    // Check if it's text (all printable ASCII)
    let isPossiblyText = true;
    for (let i = 0; i < Math.min(100, data.length); i++) {
      if (data[i] < 32 && data[i] !== 9 && data[i] !== 10 && data[i] !== 13) {
        isPossiblyText = false;
        break;
      }
    }
    if (isPossiblyText) return 'text';

    return 'binary';
  };

  const handleDownload = () => {
    if (!blobData) return;

    const blob = new Blob([new Uint8Array(blobData)]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `walrus-blob-${blobId.substring(0, 8)}.${
      contentType === 'pdf' ? 'pdf' : 
      contentType === 'image' ? 'png' : 
      contentType === 'text' ? 'txt' : 
      'bin'
    }`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Downloaded!');
  };

  const copyBlobId = () => {
    navigator.clipboard.writeText(blobId);
    toast.success('Blob ID copied!');
  };

  const openInWalrus = () => {
    window.open(
      `https://aggregator.walrus-testnet.walrus.space/v1/blobs/${blobId}`,
      '_blank'
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-4xl font-bold text-white drop-shadow-lg">View Walrus Blob</h2>
        <p className="text-white/80 text-lg">
          Fetch and view content stored on Walrus by entering its blob ID
        </p>
      </div>

      {/* Search Box */}
      <Card className="max-w-4xl mx-auto">
        <CardBody className="p-6">
          <div className="space-y-4">
            <div className="flex gap-3">
              <Input
                value={blobId}
                onChange={setBlobId}
                placeholder="Enter Walrus blob ID (e.g., mJdVqiYbaNLs9nYaBXEt21QxTc4GMUnwm87QvHlVGEA)"
                className="flex-1 font-mono text-sm"
                disabled={isLoading}
              />
              <Button
                variant="primary"
                onClick={handleFetch}
                disabled={!blobId.trim() || isLoading}
                className="px-8"
              >
                {isLoading ? (
                  <>
                    <Loader className="w-4 h-4 mr-2 animate-spin" />
                    Fetching...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4 mr-2" />
                    Fetch
                  </>
                )}
              </Button>
            </div>

            {/* Actions */}
            {blobId && (
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant="outline"
                  onClick={copyBlobId}
                  className="text-xs"
                >
                  <Copy className="w-3 h-3 mr-1" />
                  Copy ID
                </Button>
                <Button
                  variant="outline"
                  onClick={openInWalrus}
                  className="text-xs"
                >
                  <ExternalLink className="w-3 h-3 mr-1" />
                  Open in Walrus
                </Button>
                {blobData && (
                  <Button
                    variant="outline"
                    onClick={handleDownload}
                    className="text-xs"
                  >
                    <Download className="w-3 h-3 mr-1" />
                    Download
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Error State */}
      {error && (
        <Card className="max-w-4xl mx-auto border-2 border-red-200">
          <CardBody className="p-6">
            <div className="flex items-start gap-3 text-red-600">
              <AlertCircle className="w-6 h-6 flex-shrink-0 mt-1" />
              <div>
                <p className="font-semibold">Error</p>
                <p className="text-sm mt-1 whitespace-pre-wrap">{error}</p>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Success Info */}
      {blobData && !error && (
        <Card className="max-w-4xl mx-auto border-2 border-green-200 bg-green-50">
          <CardBody className="p-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-green-800">Blob fetched successfully!</p>
                <div className="flex gap-4 text-xs text-green-700 mt-1">
                  <span>Size: {blobData.length.toLocaleString()} bytes</span>
                  <span>Type: {contentType.toUpperCase()}</span>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Content Display */}
      {blobData && !error && (
        <div className="max-w-6xl mx-auto">
          {/* PDF Viewer */}
          {contentType === 'pdf' && blobFile && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <FileText className="w-6 h-6 text-primary" />
                  <h3 className="text-xl font-semibold">PDF Document</h3>
                </div>
              </CardHeader>
              <CardBody>
                <DocumentViewer file={blobFile} title="Walrus Blob" />
              </CardBody>
            </Card>
          )}

          {/* Image Viewer */}
          {contentType === 'image' && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <FileText className="w-6 h-6 text-primary" />
                  <h3 className="text-xl font-semibold">Image</h3>
                </div>
              </CardHeader>
              <CardBody className="p-6">
                <div className="flex justify-center bg-gray-100 p-4 rounded-lg">
                  <img
                    src={URL.createObjectURL(new Blob([new Uint8Array(blobData)]))}
                    alt="Walrus blob content"
                    className="max-w-full max-h-[600px] object-contain shadow-lg rounded"
                  />
                </div>
              </CardBody>
            </Card>
          )}

          {/* Text Viewer */}
          {contentType === 'text' && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <FileText className="w-6 h-6 text-primary" />
                  <h3 className="text-xl font-semibold">Text Content</h3>
                </div>
              </CardHeader>
              <CardBody className="p-6">
                <pre className="bg-gray-100 p-4 rounded-lg overflow-auto max-h-[600px] text-sm font-mono">
                  {new TextDecoder().decode(blobData)}
                </pre>
              </CardBody>
            </Card>
          )}

          {/* Binary/Hex Viewer */}
          {contentType === 'binary' && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <FileText className="w-6 h-6 text-primary" />
                  <h3 className="text-xl font-semibold">Binary Data (Hex View)</h3>
                </div>
              </CardHeader>
              <CardBody className="p-6">
                <div className="bg-gray-100 p-4 rounded-lg overflow-auto max-h-[600px]">
                  <pre className="text-xs font-mono">
                    {Array.from(blobData.slice(0, 1000))
                      .map((b, i) => {
                        const hex = b.toString(16).padStart(2, '0');
                        return i % 16 === 0 
                          ? `\n${i.toString(16).padStart(8, '0')}: ${hex}` 
                          : hex;
                      })
                      .join(' ')}
                    {blobData.length > 1000 && '\n\n... (truncated, download to see full content)'}
                  </pre>
                </div>
              </CardBody>
            </Card>
          )}

          {/* Raw Data Info */}
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold">Blob Information</h3>
            </CardHeader>
            <CardBody className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-600 mb-1">Blob ID</p>
                  <p className="font-mono text-xs break-all bg-gray-100 p-2 rounded">
                    {blobId}
                  </p>
                </div>
                <div>
                  <p className="text-gray-600 mb-1">Size</p>
                  <p className="font-semibold">
                    {blobData.length.toLocaleString()} bytes 
                    ({(blobData.length / 1024).toFixed(2)} KB)
                  </p>
                </div>
                <div>
                  <p className="text-gray-600 mb-1">Content Type</p>
                  <p className="font-semibold">{contentType.toUpperCase()}</p>
                </div>
                <div>
                  <p className="text-gray-600 mb-1">First 4 bytes (hex)</p>
                  <p className="font-mono text-xs">
                    {Array.from(blobData.slice(0, 4))
                      .map(b => b.toString(16).padStart(2, '0'))
                      .join(' ')}
                  </p>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Empty State */}
      {!blobData && !isLoading && !error && (
        <Card className="max-w-4xl mx-auto">
          <CardBody className="p-12 text-center">
            <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Enter a Blob ID
            </h3>
            <p className="text-gray-600 mb-4">
              Enter a Walrus blob ID above to fetch and view its content
            </p>
            <div className="text-sm text-gray-500 space-y-1">
              <p>💡 Blob IDs are base64-encoded strings like:</p>
              <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                mJdVqiYbaNLs9nYaBXEt21QxTc4GMUnwm87QvHlVGEA
              </code>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

