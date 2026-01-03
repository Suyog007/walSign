import { useState } from 'react';
import { useCurrentAccount, useSignAndExecuteTransactionBlock } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { encryptPDF } from '../services/documentService';
import { uploadToWalrus } from '../services/walrusService';
import { PACKAGE_ID, suiClient, REGISTRY_OBJECT_ID } from '../config/seal.config';

export interface UploadProgress {
  stage: 'idle' | 'encrypting' | 'uploading' | 'recording' | 'issuing' | 'complete' | 'error';
  message: string;
  progress: number;
}

export function useDocumentUpload() {
  const currentAccount = useCurrentAccount();
  const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransactionBlock();
  const [progress, setProgress] = useState<UploadProgress>({
    stage: 'idle',
    message: '',
    progress: 0,
  });

  const uploadDocument = async (
    pdfFile: File,
    title: string,
    authorizedSigners: string[]
  ): Promise<{
    documentId: string;
    walrusBlobId: string;
    txHash: string;
  }> => {
    if (!currentAccount) {
      throw new Error('Wallet not connected');
    }

    try {
      // Stage 1: Create document on-chain (with empty/placeholder blob ID)
      setProgress({
        stage: 'recording',
        message: 'Creating document record on blockchain...',
        progress: 10,
      });

      // Deduplicate authorized signers to prevent duplicates on-chain
      const uniqueAuthorizedSigners = [...new Set(authorizedSigners)];
      
      console.log("Document creation started");
      console.log("Title:", title);
      console.log("Original Authorized Signers:", authorizedSigners);
      console.log("Unique Authorized Signers:", uniqueAuthorizedSigners);
      console.log("Authorized Signers Length:", uniqueAuthorizedSigners.length);

      const createDocTx = new Transaction();
      createDocTx.moveCall({
        target: `${PACKAGE_ID}::wal_sign::create_document`,
        arguments: [
          createDocTx.object(REGISTRY_OBJECT_ID),
          createDocTx.pure.string(""), // Empty blob ID initially
          createDocTx.pure.string(title), // title
          createDocTx.pure.string(""), // description (empty for now)
          createDocTx.pure.vector('address', uniqueAuthorizedSigners), // authorized_signers (deduplicated)
          createDocTx.object('0x6'), // Clock object
        ],
      });

      // Execute transaction with connected wallet
      const createResult = await new Promise<any>((resolve, reject) => {
        signAndExecuteTransaction(
          {
            transactionBlock: createDocTx as any,
            options: {
              showEffects: true,
              showObjectChanges: true,
            },
          },
          {
            onSuccess: (result: any) => {
              console.log("Create document transaction successful:", result);
              resolve(result);
            },
            onError: (error: any) => {
              console.error("Create document transaction failed:", error);
              reject(error);
            },
          }
        );
      });

      // Extract the created document ID
      const createdObjects = createResult.objectChanges?.filter(
        (obj: any) => obj.type === 'created' && obj.objectType?.includes('::Document')
      );
      
      if (!createdObjects || createdObjects.length === 0) {
        throw new Error('Failed to create document - no document object found in transaction');
      }

      const documentId = createdObjects[0].objectId;

      console.log("Document created successfully");
      console.log("Document ID: ", documentId);

      // Stage 2: Encrypt PDF with Seal (using the real document ID)
      setProgress({
        stage: 'encrypting',
        message: 'Encrypting PDF with Seal...',
        progress: 30,
      });

      console.log("Encryption started");
      
      const encryptionResult = await encryptPDF(
        PACKAGE_ID,
        documentId, // Use the real document ID for encryption
        pdfFile
      );

      console.log("Encryption completed");

      // Stage 3: Upload encrypted PDF to Walrus
      setProgress({
        stage: 'uploading',
        message: 'Uploading encrypted data to Walrus...',
        progress: 50,
      });

      console.log("Uploading to Walrus started");

      const walrusBlobId = await uploadToWalrus(encryptionResult.encryptedData);

      console.log("Walrus blob ID: ", walrusBlobId);

      // Stage 4: Update document with real Walrus blob ID
      setProgress({
        stage: 'recording',
        message: 'Updating document with Walrus blob ID...',
        progress: 70,
      });

      console.log("Updating document with Walrus blob ID:", walrusBlobId);

      const updateBlobTx = new Transaction();
      updateBlobTx.moveCall({
        target: `${PACKAGE_ID}::wal_sign::update_blob_id`,
        arguments: [
          updateBlobTx.object(documentId),
          updateBlobTx.pure.string(walrusBlobId), // Real Walrus blob ID
        ],
      });

      await new Promise<void>((resolve, reject) => {
        signAndExecuteTransaction(
          {
            transactionBlock: updateBlobTx as any,
            options: {
              showEffects: true,
            },
          },
          {
            onSuccess: (result: any) => {
              console.log("Blob ID updated successfully:", result);
              resolve();
            },
            onError: (error: any) => {
              console.error("Failed to update blob ID:", error);
              reject(error);
            },
          }
        );
      });

      // Stage 5: Issue signer capabilities
      setProgress({
        stage: 'issuing',
        message: 'Issuing signing capabilities...',
        progress: 85,
      });

      

      // Complete
      setProgress({
        stage: 'complete',
        message: 'Document uploaded successfully!',
        progress: 100,
      });

      return {
        documentId,
        walrusBlobId,
        txHash: createResult.digest,
      };

    } catch (error) {
      console.error("Upload error:", error);
      setProgress({
        stage: 'error',
        message: error instanceof Error ? error.message : 'Upload failed',
        progress: 0,
      });
      throw error;
    }
  };

  const resetProgress = () => {
    setProgress({
      stage: 'idle',
      message: '',
      progress: 0,
    });
  };

  return {
    uploadDocument,
    progress,
    resetProgress,
    isUploading: progress.stage !== 'idle' && progress.stage !== 'complete' && progress.stage !== 'error',
  };
}
