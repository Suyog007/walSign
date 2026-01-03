import React, { useState, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { PDFDocument } from 'pdf-lib';
import { Button } from './ui/Button';
import { Card, CardBody, CardHeader } from './ui/Card';
import { 
  Upload, 
  Save, 
  X, 
  ZoomIn, 
  ZoomOut, 
  ChevronLeft, 
  ChevronRight,
  Move,
  Trash2,
  Check,
  Loader,
  CheckCircle
} from 'lucide-react';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

interface Signature {
  id: string;
  imageData: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pageNumber: number;
}

interface PdfSignatureEditorProps {
  pdfFile: File | Blob;
  onSave: (signedPdfBlob: Blob, signaturePositions: Signature[]) => Promise<void>;
  onCancel: () => void;
}

export const PdfSignatureEditor: React.FC<PdfSignatureEditorProps> = ({
  pdfFile,
  onSave,
  onCancel,
}) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [selectedSignature, setSelectedSignature] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isSaving, setIsSaving] = useState(false);
  const [pageWidth, setPageWidth] = useState<number>(600);
  const [pageHeight, setPageHeight] = useState<number>(800);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  const onPageLoadSuccess = (page: any) => {
    const viewport = page.getViewport({ scale: 1.0 });
    setPageWidth(viewport.width);
    setPageHeight(viewport.height);
  };

  const handleSignatureUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type - only PNG supported for now
    if (file.type !== 'image/png' && !file.name.toLowerCase().endsWith('.png')) {
      alert('⚠️ Only PNG image files are supported at this time. Please convert your image to PNG format.');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const imageData = e.target?.result as string;
      
      // Automatically add signature to current page
      const newSignature: Signature = {
        id: `sig-${Date.now()}`,
        imageData: imageData,
        x: 100,
        y: 100,
        width: 200,
        height: 80,
        pageNumber: currentPage,
      };

      setSignatures([...signatures, newSignature]);
      setSelectedSignature(newSignature.id);
      
      // Reset file input so same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  const handleMouseDown = (e: React.MouseEvent, signatureId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const signature = signatures.find(s => s.id === signatureId);
    if (!signature) return;

    setSelectedSignature(signatureId);
    setIsDragging(true);
    
    const container = containerRef.current;
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left - signature.x * scale,
      y: e.clientY - rect.top - signature.y * scale,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !selectedSignature || !containerRef.current) return;

    const signature = signatures.find(s => s.id === selectedSignature);
    if (!signature) return;

    const rect = containerRef.current.getBoundingClientRect();
    const newX = (e.clientX - rect.left - dragOffset.x) / scale;
    const newY = (e.clientY - rect.top - dragOffset.y) / scale;

    setSignatures(signatures.map(sig => 
      sig.id === selectedSignature 
        ? { 
            ...sig, 
            x: Math.max(0, Math.min(pageWidth - sig.width, newX)),
            y: Math.max(0, Math.min(pageHeight - sig.height, newY))
          }
        : sig
    ));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const deleteSignature = (signatureId: string) => {
    setSignatures(signatures.filter(s => s.id !== signatureId));
    if (selectedSignature === signatureId) {
      setSelectedSignature(null);
    }
  };

  const createSignedPdfBlob = async (): Promise<Blob> => {
    // Load the PDF
    const pdfBytes = await pdfFile.arrayBuffer();
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();

    // Add signatures to each page
    for (const sig of signatures) {
      const page = pages[sig.pageNumber - 1];
      if (!page) continue;

      // Load signature image - convert data URL to bytes
      let image;
      
      try {
        // Extract base64 data from data URL
        const base64Data = sig.imageData.split(',')[1];
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        
        // Detect image format from magic bytes instead of MIME type
        // PNG magic bytes: 89 50 4E 47
        // JPEG magic bytes: FF D8 FF
        const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
        const isJpeg = bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF;
        
        console.log('Image format detection:', {
          isPng,
          isJpeg,
          firstBytes: Array.from(bytes.slice(0, 4)).map(b => b.toString(16)).join(' '),
          mimeType: sig.imageData.split(',')[0]
        });
        
        if (isPng) {
          image = await pdfDoc.embedPng(bytes);
        } else if (isJpeg) {
          image = await pdfDoc.embedJpg(bytes);
        } else {
          // Fallback: try based on MIME type in data URL
          if (sig.imageData.includes('image/png') || sig.imageData.includes('data:image/png')) {
            console.log('Trying PNG based on MIME type...');
            image = await pdfDoc.embedPng(bytes);
          } else if (sig.imageData.includes('image/jpeg') || sig.imageData.includes('image/jpg') || sig.imageData.includes('data:image/jpeg') || sig.imageData.includes('data:image/jpg')) {
            console.log('Trying JPEG based on MIME type...');
            image = await pdfDoc.embedJpg(bytes);
          } else {
            throw new Error('Unsupported image format. Please use PNG or JPEG.');
          }
        }
      } catch (err) {
        console.error('Error loading signature image:', err);
        console.error('Image data:', sig.imageData.substring(0, 100));
        throw new Error(`Failed to load signature image: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }

      // Get page dimensions
      const { width: pageWidth, height: pageHeight } = page.getSize();

      // Convert signature coordinates (top-left origin) to PDF coordinates (bottom-left origin)
      const pdfX = sig.x;
      const pdfY = pageHeight - sig.y - sig.height;

      // Draw the signature
      page.drawImage(image, {
        x: pdfX,
        y: pdfY,
        width: sig.width,
        height: sig.height,
      });
    }

    // Save the modified PDF
    const modifiedPdfBytes = await pdfDoc.save();
    // Create Blob from Uint8Array
    return new Blob([modifiedPdfBytes as any], { type: 'application/pdf' });
  };

  const handleSave = async () => {
    if (signatures.length === 0) {
      alert('Please add at least one signature before saving.');
      return;
    }

    setIsSaving(true);
    try {
      const blob = await createSignedPdfBlob();
      await onSave(blob, signatures);
    } catch (error) {
      console.error('Error saving signed PDF:', error);
      alert('Failed to save signed PDF. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const currentPageSignatures = signatures.filter(sig => sig.pageNumber === currentPage);

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-xl font-semibold">Sign Document</h3>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex flex-col">
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSaving}
                  className="text-sm"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Add Signature
                </Button>
                <span className="text-xs text-yellow-600 mt-1 text-center">
                  ⚠️ PNG only
                </span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,.png"
                onChange={handleSignatureUpload}
                className="hidden"
              />
              <Button
                onClick={handleSave}
                disabled={signatures.length === 0 || isSaving}
                variant="primary"
                className="text-sm"
              >
                {isSaving ? (
                  <>
                    <Loader className="w-4 h-4 mr-2 animate-spin" />
                    Signing...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Sign
                  </>
                )}
              </Button>
              {signatures.length > 0 && (
                <Button
                  variant="outline"
                  onClick={onCancel}
                  disabled={isSaving}
                  className="text-sm"
                >
                  <X className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Signature Added Notification */}
      {signatures.length > 0 && (
        <Card>
          <CardBody className="p-4 bg-green-50">
            <div className="flex items-center gap-4">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
              <p className="text-sm font-medium text-green-800">
                {signatures.length} signature{signatures.length > 1 ? 's' : ''} added! Drag to reposition, then click "Sign" to complete.
              </p>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Controls */}
      <Card>
        <CardBody className="p-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            {/* Page Navigation */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1 || isSaving}
                className="px-3"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm font-medium px-4 whitespace-nowrap">
                Page {currentPage} of {numPages}
              </span>
              <Button
                variant="outline"
                onClick={() => setCurrentPage(Math.min(numPages, currentPage + 1))}
                disabled={currentPage === numPages || isSaving}
                className="px-3"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            {/* Zoom Controls */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setScale(Math.max(0.5, scale - 0.1))}
                disabled={isSaving}
                className="px-3"
              >
                <ZoomOut className="w-4 h-4" />
              </Button>
              <span className="text-sm font-medium px-4 whitespace-nowrap">
                {Math.round(scale * 100)}%
              </span>
              <Button
                variant="outline"
                onClick={() => setScale(Math.min(2, scale + 0.1))}
                disabled={isSaving}
                className="px-3"
              >
                <ZoomIn className="w-4 h-4" />
              </Button>
            </div>

            {/* Signatures on Page */}
            <div className="text-sm text-gray-600 whitespace-nowrap">
              {currentPageSignatures.length} signature(s) on this page
            </div>
          </div>
        </CardBody>
      </Card>

      {/* PDF Editor Area */}
      <Card>
        <CardBody className="p-0">
          <div
            ref={containerRef}
            className="relative bg-gray-100 flex justify-center items-start p-8 overflow-auto"
            style={{ minHeight: '700px' }}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {/* PDF Page */}
            <div className="relative inline-block" style={{ userSelect: 'none' }}>
              <Document
                file={pdfFile}
                onLoadSuccess={onDocumentLoadSuccess}
                loading={
                  <div className="flex items-center justify-center h-[600px]">
                    <div className="text-gray-500">
                      <Loader className="w-8 h-8 animate-spin mx-auto mb-2" />
                      <p>Loading PDF...</p>
                    </div>
                  </div>
                }
              >
                <Page
                  pageNumber={currentPage}
                  scale={scale}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  onLoadSuccess={onPageLoadSuccess}
                  className="shadow-lg"
                />
              </Document>

              {/* Signature Overlays */}
              {currentPageSignatures.map((sig) => (
                <div
                  key={sig.id}
                  className={`absolute cursor-move border-2 transition-all ${
                    selectedSignature === sig.id
                      ? 'border-blue-500 shadow-lg ring-2 ring-blue-300'
                      : 'border-dashed border-gray-400 hover:border-blue-400'
                  }`}
                  style={{
                    left: `${sig.x * scale}px`,
                    top: `${sig.y * scale}px`,
                    width: `${sig.width * scale}px`,
                    height: `${sig.height * scale}px`,
                    pointerEvents: isSaving ? 'none' : 'auto',
                  }}
                  onMouseDown={(e) => handleMouseDown(e, sig.id)}
                  onClick={() => setSelectedSignature(sig.id)}
                >
                  <img
                    src={sig.imageData}
                    alt="Signature"
                    className="w-full h-full object-contain bg-white/90 pointer-events-none"
                    draggable={false}
                  />
                  
                  {/* Controls */}
                  {selectedSignature === sig.id && !isSaving && (
                    <div className="absolute -top-10 right-0 flex gap-1 bg-white rounded shadow-lg p-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteSignature(sig.id);
                        }}
                        className="p-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                  
                  {/* Drag indicator */}
                  {selectedSignature === sig.id && (
                    <div className="absolute top-1 left-1 bg-blue-500 text-white rounded p-1">
                      <Move className="w-3 h-3" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Instructions */}
      <Card>
        <CardBody className="p-4 bg-blue-50">
          <div className="text-sm text-blue-800 space-y-2">
            <p className="font-semibold flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Instructions:
            </p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>Click <strong>"Add Signature"</strong> to select your signature image (<strong>PNG format only</strong> - other formats will be rejected) - it will automatically appear on the PDF</li>
              <li><strong>Click and drag</strong> the signature to position it where you want</li>
              <li>Use the <strong>page navigation</strong> buttons to move between pages and add more signatures if needed</li>
              <li>Click <strong>"Sign"</strong> when done to encrypt, upload, and record your signature on the blockchain</li>
            </ol>
            <div className="mt-3 p-2 bg-yellow-100 border border-yellow-300 rounded text-yellow-800 text-xs">
              <strong>⚠️ Note:</strong> Only PNG image files are currently supported. Please convert JPEG or other formats to PNG before uploading.
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
};
