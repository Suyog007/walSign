import { useCurrentAccount, useCurrentWallet, useSuiClient } from '@mysten/dapp-kit';

export function useSuiWallet() {
  const currentAccount = useCurrentAccount();
  const wallet = useCurrentWallet();
  const client = useSuiClient();
  const connected = !!currentAccount;
  return { currentAccount, wallet, client, connected };
}


