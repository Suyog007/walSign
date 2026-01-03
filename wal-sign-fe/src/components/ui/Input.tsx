import React from 'react';
import { cn } from './cn';

export function Input({
  label,
  value,
  onChange,
  placeholder,
  error,
  helper,
  className,
  type = 'text',
  disabled = false,
}: {
  label?: string;
  value?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  error?: string;
  helper?: string;
  className?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <div className={cn('space-y-1', className)}>
      {label && <label className="text-sm font-medium">{label}</label>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          'w-full rounded-lg border px-3 py-2 outline-none transition focus:ring-2',
          error ? 'border-error focus:ring-error/30' : 'border-gray-300 focus:ring-primary/30',
          disabled && 'bg-gray-100 cursor-not-allowed opacity-60',
        )}
      />
      {helper && <p className="text-xs text-gray-500">{helper}</p>}
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}


