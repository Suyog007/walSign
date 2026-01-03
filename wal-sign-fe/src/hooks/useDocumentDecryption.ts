import { useState } from 'react';
import { useCurrentAccount, useSignPersonalMessage } from '@mysten/dapp-kit';
import { decryptPDF } from '../services/documentService';
import { downloadFromWalrus } from '../services/walrusService';
import { PACKAGE_ID, suiClient } from '../config/seal.config';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromBase64 } from '@mysten/bcs';
import { SessionKey } from '@mysten/seal';

export function useDocumentDecryption() {
  const currentAccount = useCurrentAccount();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();

  const [isDecrypting, setIsDecrypting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decryptDocument = async (documentId: string, walrusBlobId: string) => {
    if (!currentAccount) {
      setError("Wallet not connected");
      return null;
    }

    setIsDecrypting(true);
    setError(null);

    try {

      //
      // Step 1: Download encrypted blob
      //
      const encryptedData = await downloadFromWalrus(walrusBlobId);

      //
      // Step 2: Create SEAL session key for the signer
      //
      const sessionKey = await SessionKey.create({
        address: currentAccount.address,
        suiClient,
        ttlMin: 30,
        packageId: PACKAGE_ID,
      });

      //
      // Step 3: Decrypt via SEAL
      //
      const decryptedBytes = await decryptPDF(
        PACKAGE_ID,
        suiClient,
        documentId,
        encryptedData,
        sessionKey,
        signPersonalMessage,
      );
      

      if (!decryptedBytes) {
        setError("Not authorized or wrong key");
        return null;
      }

      //
      // Step 5: Convert to PDF Blob
      //
      const pdfBlob = new Blob([new Uint8Array(decryptedBytes)], {
        type: "application/pdf",
      });

      return pdfBlob;

    } catch (err) {
      const msg = err instanceof Error ? err.message : "Decryption failed";
      setError(msg);
      console.error("Decrypt error:", err);
      return null;
    } finally {
      setIsDecrypting(false);
    }
  };

  return {
    decryptDocument,
    isDecrypting,
    error,
  };
}
