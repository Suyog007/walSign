'use client';
import { Link, useLocation } from 'react-router-dom';
import { ConnectWallet } from './ConnectWallet';
import { cn } from './ui/cn';

export function Navbar() {
  const location = useLocation();
  const link = (to: string, label: string, icon: React.ReactNode) => (
    <Link 
      to={to} 
      className={cn(
        'px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2',
        location.pathname === to 
          ? 'bg-white text-primary shadow-md' 
          : 'text-white hover:bg-white/20'
      )}
    >
      {icon}
      {label}
    </Link>
  );
  
  return (
    <nav className="glass-dark border-b border-white/20 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link to="/" className="flex items-center gap-3 text-white">
            <div className="h-12 w-12 flex-shrink-0">
              <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
                {/* Walrus Head Silhouette */}
                <g transform="translate(100, 100)">
                  {/* Main head */}
                  <ellipse cx="0" cy="0" rx="50" ry="40" fill="#FFFFFF" stroke="#C4B5FD" stroke-width="2"/>
                  
                  {/* Tusks */}
                  <path d="M -18 18 Q -22 38, -18 50" stroke="#FFFFFF" stroke-width="5" fill="none" stroke-linecap="round"/>
                  <path d="M 18 18 Q 22 38, 18 50" stroke="#FFFFFF" stroke-width="5" fill="none" stroke-linecap="round"/>
                  
                  {/* Snout */}
                  <ellipse cx="0" cy="12" rx="28" ry="20" fill="#E0E7FF" stroke="#FFFFFF" stroke-width="1.5"/>
                  
                  {/* Eyes */}
                  <circle cx="-18" cy="-8" r="4" fill="#1E293B"/>
                  <circle cx="18" cy="-8" r="4" fill="#1E293B"/>
                  
                  {/* Whisker dots */}
                  <circle cx="-25" cy="8" r="2" fill="#FFFFFF"/>
                  <circle cx="-30" cy="12" r="2" fill="#FFFFFF"/>
                  <circle cx="25" cy="8" r="2" fill="#FFFFFF"/>
                  <circle cx="30" cy="12" r="2" fill="#FFFFFF"/>
                </g>
                
                {/* Document/Signature Element */}
                <g transform="translate(140, 60)">
                  {/* Document */}
                  <rect x="0" y="0" width="35" height="45" rx="2" fill="#FFFFFF" stroke="#C4B5FD" stroke-width="2"/>
                  {/* Signature lines */}
                  <line x1="6" y1="12" x2="29" y2="12" stroke="#A78BFA" stroke-width="1.5"/>
                  <line x1="6" y1="20" x2="29" y2="20" stroke="#A78BFA" stroke-width="1.5"/>
                  {/* Signature scribble */}
                  <path d="M 8 30 Q 12 28, 16 30 T 28 30" stroke="#C4B5FD" stroke-width="2" fill="none" stroke-linecap="round"/>
                  {/* Checkmark */}
                  <path d="M 25 36 L 29 40 L 34 32" stroke="#10B981" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
                </g>
              </svg>
            </div>
            <div>
              <div className="text-xl font-bold">WalSign</div>
            </div>
          </Link>
          <div className="hidden md:flex items-center gap-2">
            {link('/', 'Home', 
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            )}
            {link('/profile', 'My Documents',
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            )}
            {link('/upload', 'Upload',
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            )}
            {link('/verify', 'Verify',
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            {link('/view-blob', 'View Blob',
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ConnectWallet />
        </div>
      </div>
    </nav>
  );
}


