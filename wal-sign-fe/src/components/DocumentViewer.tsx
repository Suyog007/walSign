import { useCallback, useEffect, useState, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
// Configure pdf.js worker for Vite
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.js',
  import.meta.url,
).toString();

type ViewerFile = File | ArrayBuffer | Uint8Array | string | null | undefined;

export function DocumentViewer({
  file,
  title,
}: {
  file?: ViewerFile;
  title?: string;
}) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [error, setError] = useState<string>('');
  const [scale, setScale] = useState<number>(0.6); // Default zoom at 60%
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPageNumber(1);
    setError('');
  }, [file]);

  // Scale is fixed at 0.6 (60%) - no need for width calculations

  const onLoadSuccess = useCallback(
    ({ numPages: n }: { numPages: number }) => {
      setNumPages(n);
      setError('');
    },
    [],
  );

  const onLoadError = useCallback((e: unknown) => {
    setError('Failed to load PDF');
    // console.error(e);
  }, []);

  const canPrev = pageNumber > 1;
  const canNext = pageNumber < numPages;

  return (
    <div className="flex flex-col gap-3 w-full">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm text-gray-700">
          {title ? <span className="font-medium">{title}</span> : <span className="text-gray-500">PDF</span>}
          {numPages ? <span className="ml-2 text-gray-500">({numPages} pages)</span> : null}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <button
            className="px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            disabled={!canPrev}
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
          >
            ← Prev
          </button>
          <span className="px-2 font-medium">
            {pageNumber}/{numPages || 1}
          </span>
          <button
            className="px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            disabled={!canNext}
            onClick={() => setPageNumber((p) => Math.min(numPages || 1, p + 1))}
          >
            Next →
          </button>
        </div>
      </div>

      <div 
        ref={containerRef}
        className="h-[600px] w-full overflow-auto rounded-lg border border-gray-200 bg-gray-50 flex items-start justify-center p-4"
      >
        {!file ? (
          <div className="m-auto text-gray-500">Upload a PDF to preview</div>
        ) : (
          <Document 
            file={file as any} 
            onLoadSuccess={onLoadSuccess} 
            onLoadError={onLoadError} 
            renderMode="canvas"
            className="w-full"
          >
            <Page 
              pageNumber={pageNumber} 
              scale={scale}
              renderTextLayer={false}
              renderAnnotationLayer={false}
            />
          </Document>
        )}
      </div>

      {error && <div className="text-sm text-error">{error}</div>}
    </div>
  );
}


