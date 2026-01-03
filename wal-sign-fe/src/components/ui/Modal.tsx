import React from 'react';
import { Button } from './Button';

export function Modal({
  open,
  title,
  children,
  onClose,
  showFooter = false,
}: {
  open: boolean;
  title: string | React.ReactNode;
  children: React.ReactNode;
  onClose: () => void;
  showFooter?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl rounded-xl bg-white shadow-2xl border border-gray-200">
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-200">
          <div className="flex-1">
            {typeof title === 'string' ? (
              <h3 className="text-lg font-semibold">{title}</h3>
            ) : (
              title
            )}
          </div>
          <button 
            aria-label="Close" 
            onClick={onClose} 
            className="ml-4 flex-shrink-0 rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5 max-h-[70vh] overflow-y-auto">{children}</div>
        {showFooter && (
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200">
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
        )}
      </div>
    </div>
  );
}


