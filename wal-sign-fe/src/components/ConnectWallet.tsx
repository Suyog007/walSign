import { useState, useRef, useEffect } from 'react';
import { ConnectButton, useCurrentAccount, useCurrentWallet, useWallets } from '@mysten/dapp-kit';
import { useDisconnectWallet } from '@mysten/dapp-kit';
import { truncateAddress } from '../utils/addressUtils';
import { Copy, Check, ChevronDown, LogOut } from 'lucide-react';
import toast from 'react-hot-toast';

export function ConnectWallet() {
  const account = useCurrentAccount();
  const wallet = useCurrentWallet();
  const wallets = useWallets();
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const disconnectWallet = useDisconnectWallet(); 
   
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsExpanded(false);
      }
    };

    if (isExpanded) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isExpanded]);

  const handleCopy = async () => {
    if (!account?.address) return;
    
    try {
      await navigator.clipboard.writeText(account.address);
      setCopied(true);
      toast.success('Address copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error('Failed to copy address');
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectWallet.mutateAsync();
      localStorage.removeItem('sui-wallet-connection');
      setIsExpanded(false);
      toast.success('Wallet disconnected');
    } catch (error) {
      console.error('Disconnect error:', error);
      localStorage.removeItem('sui-wallet-connection');
      setIsExpanded(false);
      toast.error('Failed to disconnect wallet');
    }
  };

  return (
    <div className="flex items-center gap-3 relative" ref={dropdownRef}>
      {account ? (
        <div className="relative">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all duration-200 border border-white/20"
          >
            <span className="font-mono text-sm">{truncateAddress(account.address)}</span>
            <ChevronDown 
              className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} 
            />
          </button>
          
          {isExpanded && (
            <div className="absolute right-0 mt-2 w-80 bg-gray-900/95 backdrop-blur-xl rounded-xl shadow-2xl border border-white/30 p-4 z-50 animate-fade-in">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white/90 uppercase tracking-wide">
                    Wallet Address
                  </span>
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-primary/20 hover:bg-primary/30 text-white rounded-lg transition-colors border border-primary/30"
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="flex items-center gap-2 p-3 bg-black/30 rounded-lg border border-white/20">
                  <span className="font-mono text-sm text-white break-all">
                    {account.address}
                  </span>
                </div>
                {wallet?.currentWallet?.name && (
                  <div className="text-xs text-white/70">
                    Connected with <span className="font-semibold text-white">{wallet.currentWallet.name}</span>
                  </div>
                )}
                <div className="pt-2 border-t border-white/10">
                  <button
                    onClick={handleDisconnect}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm bg-red-500/20 hover:bg-red-500/30 text-red-200 rounded-lg transition-colors border border-red-500/30"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Disconnect Wallet</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <ConnectButton />
      )}
      {wallet?.connectionStatus === 'connecting' && (
        <span className="text-xs text-white/70">Connecting...</span>
      )}
    </div>
  );
}


