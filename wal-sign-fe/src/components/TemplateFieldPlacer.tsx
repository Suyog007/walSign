import { MouseEvent, useMemo, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { placeField, SignatureFieldPlacement } from '../services/templateService';
import { roleColor } from '../utils/roleColors';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.js', import.meta.url).toString();

const SCALE = 0.8;

/** Renders the template PDF; clicking a page adds a signature field for the active role */
export function TemplateFieldPlacer({
  file,
  roles,
  activeRole,
  fields,
  onChange,
}: {
  file: File;
  roles: string[];
  activeRole: number;
  fields: SignatureFieldPlacement[];
  onChange: (fields: SignatureFieldPlacement[]) => void;
}) {
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const source = useMemo(() => file, [file]);

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!pageSize || roles.length === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const field = placeField(
      activeRole,
      page,
      { x: event.clientX - rect.left, y: event.clientY - rect.top },
      SCALE,
      pageSize,
    );
    onChange([...fields, field]);
  };

  if (loadError) {
    return <p className="text-sm text-red-700">{loadError}</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-600">
          Click on the page to add a field for <strong style={{ color: roleColor(activeRole) }}>{roles[activeRole]}</strong>
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded border px-2 py-0.5 disabled:opacity-40"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            ←
          </button>
          <span>
            {page + 1}/{numPages || 1}
          </span>
          <button
            type="button"
            className="rounded border px-2 py-0.5 disabled:opacity-40"
            disabled={page >= numPages - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            →
          </button>
        </div>
      </div>
      <div className="max-h-[600px] overflow-auto rounded-lg border bg-gray-50 p-2">
        <Document
          file={source}
          onLoadSuccess={({ numPages: n }) => setNumPages(n)}
          onLoadError={() => setLoadError('This PDF could not be displayed')}
        >
          <div className="relative inline-block">
            <Page
              pageNumber={page + 1}
              scale={SCALE}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              onLoadSuccess={(p) => setPageSize({ width: p.originalWidth, height: p.originalHeight })}
            />
            <div
              data-testid="field-overlay"
              className="absolute inset-0 cursor-crosshair"
              onClick={handleClick}
            >
              {fields.map((field, index) =>
                field.page === page ? (
                  <div
                    key={index}
                    className="absolute flex items-start justify-between border-2 border-dashed bg-white/60 px-1 text-[10px] font-medium"
                    style={{
                      left: field.x * SCALE,
                      top: field.y * SCALE,
                      width: field.width * SCALE,
                      height: field.height * SCALE,
                      borderColor: roleColor(field.role),
                      color: roleColor(field.role),
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {roles[field.role]}
                    <button
                      type="button"
                      aria-label={`Remove ${roles[field.role]} field`}
                      onClick={() => onChange(fields.filter((_, i) => i !== index))}
                    >
                      ×
                    </button>
                  </div>
                ) : null,
              )}
            </div>
          </div>
        </Document>
      </div>
    </div>
  );
}
