import { useEffect, useRef } from 'react';
import { useCurrentAccount, useCurrentWallet, useWallets } from '@mysten/dapp-kit';

const WALLET_STORAGE_KEY = 'sui-wallet-connection';

interface StoredWalletConnection {
  walletName: string;
  accountAddress: string;
  timestamp: number;
}

export function useAutoConnectWallet() {
  const currentAccount = useCurrentAccount();
  const currentWallet = useCurrentWallet();
  const wallets = useWallets();
  const hasAttemptedAutoConnect = useRef(false);
  const isConnectingRef = useRef(false);

  // Save connection to localStorage when wallet connects
  useEffect(() => {
    if (currentAccount && currentWallet && currentWallet.connectionStatus === 'connected') {
      const walletName = currentWallet.currentWallet?.name || 'Unknown';
      const connectionData: StoredWalletConnection = {
        walletName,
        accountAddress: currentAccount.address,
        timestamp: Date.now(),
      };
      try {
        localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(connectionData));
        console.log('💾 Wallet connection saved to localStorage:', walletName);
        isConnectingRef.current = false;
      } catch (error) {
        console.error('Failed to save wallet connection:', error);
      }
    }
  }, [currentAccount, currentWallet]);

  // Track wallet status changes to detect manual disconnects
  const prevStatusRef = useRef<string | undefined>(
    currentWallet?.connectionStatus
  );
  
  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    const currentStatus = currentWallet?.connectionStatus;
    const currentWalletName = currentWallet?.currentWallet?.name;
    
    // If wallet was connected and is now disconnected, check if it's manual
    if (prevStatus === 'connected' && currentStatus === 'disconnected' && !currentAccount) {
      const stored = localStorage.getItem(WALLET_STORAGE_KEY);
      if (stored) {
        try {
          const connectionData: StoredWalletConnection = JSON.parse(stored);
          // If the stored wallet name matches current wallet, it's likely a manual disconnect
          if (connectionData.walletName === currentWalletName) {
            // Small delay to distinguish from page refresh
            const timeoutId = setTimeout(() => {
              // Double-check it's still disconnected
              if (!currentAccount && currentWallet?.connectionStatus === 'disconnected') {
                localStorage.removeItem(WALLET_STORAGE_KEY);
                console.log('🗑️ Wallet manually disconnected, cleared from localStorage');
              }
            }, 1000);
            
            return () => clearTimeout(timeoutId);
          }
        } catch (error) {
          // Ignore parse errors
        }
      }
    }
    
    prevStatusRef.current = currentStatus;
  }, [currentWallet, currentAccount]);

  // Auto-connect on mount if connection was previously saved
  useEffect(() => {
    // Only attempt once on mount
    if (hasAttemptedAutoConnect.current || isConnectingRef.current) {
      return;
    }

    const tryAutoConnect = async () => {
      // Don't try if already connected
      if (currentAccount || currentWallet?.connectionStatus === 'connected') {
        hasAttemptedAutoConnect.current = true;
        return;
      }

      try {
        const stored = localStorage.getItem(WALLET_STORAGE_KEY);
        if (!stored) {
          hasAttemptedAutoConnect.current = true;
          return;
        }

        const connectionData: StoredWalletConnection = JSON.parse(stored);
        
        // Check if stored connection is recent (within 30 days)
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        if (connectionData.timestamp < thirtyDaysAgo) {
          console.log('⏰ Stored wallet connection expired, clearing...');
          localStorage.removeItem(WALLET_STORAGE_KEY);
          hasAttemptedAutoConnect.current = true;
          return;
        }

        // Check if the wallet is available
        const walletToConnect = wallets.find((w) => w.name === connectionData.walletName);
        
        if (walletToConnect) {
          console.log(`ℹ️ Previously connected wallet ${walletToConnect.name} is available`);
          // Note: We can't programmatically connect, user needs to click ConnectButton
          // The WalletAutoConnect component will show a prompt
          hasAttemptedAutoConnect.current = true;
        } else if (wallets.length > 0) {
          // Wallet not found or not installed, clear old storage
          console.log('ℹ️ Previously connected wallet not found or not installed');
          localStorage.removeItem(WALLET_STORAGE_KEY);
          hasAttemptedAutoConnect.current = true;
        } else {
          // No wallets available yet, will retry when wallets load
          console.log('⏳ Waiting for wallet extensions to be available...');
        }
      } catch (error) {
        console.error('Error during auto-connect:', error);
        isConnectingRef.current = false;
        // Clear corrupted storage
        try {
          localStorage.removeItem(WALLET_STORAGE_KEY);
        } catch (e) {
          // Ignore errors when clearing
        }
        hasAttemptedAutoConnect.current = true;
      }
    };

    // Wait for wallets to be loaded before attempting connection
    if (wallets.length > 0 || hasAttemptedAutoConnect.current) {
      // Small delay to ensure wallet provider is fully initialized
      const timeoutId = setTimeout(tryAutoConnect, 1000);
      return () => clearTimeout(timeoutId);
    }
  }, [currentAccount, currentWallet, wallets]);

  return { currentAccount, currentWallet };
}

