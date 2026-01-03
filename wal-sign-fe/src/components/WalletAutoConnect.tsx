import { useEffect, useState } from 'react';
import { useCurrentAccount, useCurrentWallet, useWallets } from '@mysten/dapp-kit';
import { Button } from './ui/Button';
import { Card, CardBody } from './ui/Card';
import { RefreshCw, X } from 'lucide-react';
import toast from 'react-hot-toast';

const WALLET_STORAGE_KEY = 'sui-wallet-connection';

interface StoredWalletConnection {
  walletName: string;
  accountAddress: string;
  timestamp: number;
}

export function WalletAutoConnect() {
  const currentAccount = useCurrentAccount();
  const currentWallet = useCurrentWallet();
  const wallets = useWallets();
  const [showReconnectPrompt, setShowReconnectPrompt] = useState(false);
  const [storedConnection, setStoredConnection] = useState<StoredWalletConnection | null>(null);

  // Check for stored connection on mount
  useEffect(() => {
    if (!currentAccount && currentWallet?.connectionStatus !== 'connected') {
      try {
        const stored = localStorage.getItem(WALLET_STORAGE_KEY);
        if (stored) {
          const connectionData: StoredWalletConnection = JSON.parse(stored);
          
          // Check if connection is recent (within 30 days)
          const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
          if (connectionData.timestamp >= thirtyDaysAgo) {
            setStoredConnection(connectionData);
            // Show reconnect prompt after a short delay (to allow wallet to auto-connect)
            const timeoutId = setTimeout(() => {
              if (!currentAccount) {
                setShowReconnectPrompt(true);
              }
            }, 2000);
            return () => clearTimeout(timeoutId);
          } else {
            // Expired, clear it
            localStorage.removeItem(WALLET_STORAGE_KEY);
          }
        }
      } catch (error) {
        console.error('Error checking stored connection:', error);
      }
    } else {
      setShowReconnectPrompt(false);
    }
  }, [currentAccount, currentWallet]);

  // Hide prompt when connected
  useEffect(() => {
    if (currentAccount) {
      setShowReconnectPrompt(false);
    }
  }, [currentAccount]);

  const handleReconnect = () => {
    // Just show a message - user needs to click ConnectButton
    toast('Please click "Connect Wallet" to reconnect', { icon: 'ℹ️' });
    setShowReconnectPrompt(false);
  };

  const handleDismiss = () => {
    setShowReconnectPrompt(false);
    // Clear storage so prompt doesn't show again
    localStorage.removeItem(WALLET_STORAGE_KEY);
  };

  if (!showReconnectPrompt || !storedConnection) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm animate-fade-in">
      <Card className="border-2 border-primary/30 shadow-2xl">
        <CardBody className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <h4 className="font-semibold text-gray-900 mb-1">Reconnect Wallet?</h4>
              <p className="text-sm text-gray-600 mb-3">
                You were previously connected with {storedConnection.walletName}. 
                Click below to reconnect automatically.
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={handleReconnect}
                  variant="primary"
                  className="text-sm flex-1"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Reconnect
                </Button>
                <Button
                  onClick={handleDismiss}
                  variant="outline"
                  className="text-sm"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

