export interface DocumentMetadata {
  documentId: string;
  title: string;
  description?: string;
  creator: string;
  createdAt: number;
  originalDocumentHash: string;
  encryptedDocumentHash: string;
  walrusBlobId: string;
  sealMetadata: string;
  authorizedSigners: string[];
  signatures: Signature[];
  status: 0 | 1 | 2; // 0=pending, 1=partial, 2=complete
}

export interface Signature {
  signer: string;
  signedAt: number;
  epoch: number;
}

export interface SignerCapability {
  id: string;
  documentId: string;
  signer: string;
}

export interface EncryptionResult {
  encryptedData: Uint8Array;
  originalHash: string;
  encryptedHash: string;
  sealMetadata: string;
}


