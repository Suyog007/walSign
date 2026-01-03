import React from 'react';
import { cn } from './cn';

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('glass rounded-2xl shadow-xl border border-white/20 hover:shadow-2xl transition-all duration-300', className)}>{children}</div>;
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('px-6 py-4 border-b border-gray-200/30', className)}>{children}</div>;
}

export function CardBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('px-6 py-4', className)}>{children}</div>;
}

export function CardFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('px-6 py-4 border-t border-gray-200/30', className)}>{children}</div>;
}


