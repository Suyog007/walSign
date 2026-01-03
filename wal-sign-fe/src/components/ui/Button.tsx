import { cn } from './cn';
import React from 'react';

type Variant = 'primary' | 'secondary' | 'outline' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  className?: string;
}

const base = 'inline-flex items-center justify-center rounded-lg font-medium transition-all disabled:opacity-60 disabled:cursor-not-allowed';
const variants: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:brightness-110',
  secondary: 'bg-secondary text-white hover:brightness-110',
  outline: 'border border-gray-300 bg-white hover:bg-gray-50',
  danger: 'bg-error text-white hover:brightness-110',
};
const sizes: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-3 text-base',
};

export function Button({ variant = 'primary', size = 'md', disabled, loading, children, onClick, type = 'button', className }: ButtonProps) {
  return (
    <button type={type} onClick={onClick} disabled={disabled || loading} className={cn(base, variants[variant], sizes[size], className)}>
      {loading && <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
      {children}
    </button>
  );
}


