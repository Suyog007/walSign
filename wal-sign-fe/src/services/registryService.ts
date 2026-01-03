import { SuiClient } from "@mysten/sui/client";
import { PACKAGE_ID, REGISTRY_OBJECT_ID } from "../config/seal.config";

export interface DocumentSignature {
  signer: string;
  signedAt: number;
}

export interface DocumentSummary {
  documentId: string;
  title: string;
  description: string;
  creator: string;
  walrusBlobId: string;
  signedBlobIds: string[]; // Vector of signed blob IDs (newest last)
  authorizedSigners: string[];
  signatures: DocumentSignature[];
  createdAt: number;
  status: 0 | 1 | 2; // 0 = Pending, 1 = Partial, 2 = Complete
}

/**
 * Get all documents created by a user by querying DocumentRegistry dynamic fields
 */
export async function getUserCreatedDocuments(
  suiClient: SuiClient,
  userAddress: string
): Promise<string[]> {
  try {
    // Get the registry object
    const registry = await suiClient.getObject({
      id: REGISTRY_OBJECT_ID,
      options: {
        showContent: true,
      },
    });

    if (!registry.data?.content || registry.data.content.dataType !== 'moveObject') {
      console.error('Registry not found or invalid');
      return [];
    }

    const fields = registry.data.content.fields as any;
    
    // The created_by_user is a Table, we need to query its dynamic field for this user
    const createdByUserTableId = fields.created_by_user?.fields?.id?.id;
    
    if (!createdByUserTableId) {
      console.error('created_by_user table ID not found');
      return [];
    }

    try {
      // Query the dynamic field for this user's address
      const dynamicField = await suiClient.getDynamicFieldObject({
        parentId: createdByUserTableId,
        name: {
          type: 'address',
          value: userAddress,
        },
      });

      if (dynamicField.data?.content && dynamicField.data.content.dataType === 'moveObject') {
        const value = (dynamicField.data.content.fields as any).value;
        
        // The value is a vector of IDs (object IDs as strings with 0x prefix)
        return value || [];
      }
    } catch (error: any) {
      // If the dynamic field doesn't exist, it means the user has no documents
      if (error.message?.includes('Could not find the referenced object')) {
        return [];
      }
      throw error;
    }

    return [];
  } catch (error) {
    console.error('Error fetching created documents:', error);
    return [];
  }
}

/**
 * Get all documents assigned to a user (to sign)
 */
export async function getUserAssignedDocuments(
  suiClient: SuiClient,
  userAddress: string
): Promise<string[]> {
  try {
    // Get the registry object
    const registry = await suiClient.getObject({
      id: REGISTRY_OBJECT_ID,
      options: {
        showContent: true,
      },
    });

    if (!registry.data?.content || registry.data.content.dataType !== 'moveObject') {
      console.error('Registry not found or invalid');
      return [];
    }

    const fields = registry.data.content.fields as any;
    
    // The assigned_to_user is a Table, we need to query its dynamic field for this user
    const assignedToUserTableId = fields.assigned_to_user?.fields?.id?.id;
    
    if (!assignedToUserTableId) {
      console.error('assigned_to_user table ID not found');
      return [];
    }

    try {
      // Query the dynamic field for this user's address
      const dynamicField = await suiClient.getDynamicFieldObject({
        parentId: assignedToUserTableId,
        name: {
          type: 'address',
          value: userAddress,
        },
      });

      if (dynamicField.data?.content && dynamicField.data.content.dataType === 'moveObject') {
        const value = (dynamicField.data.content.fields as any).value;
        return value || [];
      }
    } catch (error: any) {
      // If the dynamic field doesn't exist, it means the user has no assigned documents
      if (error.message?.includes('Could not find the referenced object')) {
        return [];
      }
      throw error;
    }

    return [];
  } catch (error) {
    console.error('Error fetching assigned documents:', error);
    return [];
  }
}

/**
 * Get full document details
 */
export async function getDocumentDetails(
  suiClient: SuiClient,
  documentId: string
): Promise<DocumentSummary | null> {
  try {
    const docObject = await suiClient.getObject({
      id: documentId,
      options: {
        showContent: true,
      },
    });

    if (!docObject.data?.content || docObject.data.content.dataType !== 'moveObject') {
      console.error('Document not found or invalid');
      return null;
    }

    const fields = docObject.data.content.fields as any;
    
    const processedSignatures = (fields.signatures || [])
      .filter((sig: any) => {
        // Check for signer in different possible formats
        const hasSigner = sig && (sig.signer || sig.fields?.signer);
        if (!hasSigner) {
          console.warn('Filtering out invalid signature:', sig);
        }
        return hasSigner;
      })
      .map((sig: any) => {
        // Handle both direct fields and nested fields structure
        const signerAddr = sig.signer || sig.fields?.signer;
        const timestamp = sig.signed_at || sig.signedAt || sig.fields?.signed_at || sig.fields?.signedAt || 0;
        
        return {
          signer: signerAddr,
          signedAt: parseInt(timestamp),
        };
      });

    // Deduplicate authorized signers (remove duplicates)
    const uniqueAuthorizedSigners = [...new Set((fields.authorized_signers || []) as string[])];

    // Get signed blob IDs vector
    const signedBlobIds = (fields.signed_blob_id || []) as string[];

    return {
      documentId,
      title: fields.title,
      description: fields.description || '',
      creator: fields.creator,
      walrusBlobId: fields.walrus_blob_id,
      signedBlobIds: signedBlobIds,
      authorizedSigners: uniqueAuthorizedSigners,
      signatures: processedSignatures,
      createdAt: parseInt(fields.created_at),
      status: fields.status,
    };
  } catch (error) {
    console.error('Error fetching document details:', error);
    return null;
  }
}

/**
 * Get multiple document details at once
 */
export async function getMultipleDocuments(
  suiClient: SuiClient,
  documentIds: string[]
): Promise<DocumentSummary[]> {
  const documents = await Promise.all(
    documentIds.map(id => getDocumentDetails(suiClient, id))
  );

  return documents.filter((doc): doc is DocumentSummary => doc !== null);
}

/**
 * Get the latest blob ID for a document
 * Returns the last element from signed_blob_id vector if it exists,
 * otherwise returns the original walrus_blob_id
 */
export function getLatestBlobId(document: DocumentSummary): string {
  if (document.signedBlobIds && document.signedBlobIds.length > 0) {
    return document.signedBlobIds[document.signedBlobIds.length - 1];
  }
  return document.walrusBlobId;
}

/**
 * Get registry stats (total documents, etc.)
 */
export async function getRegistryStats(suiClient: SuiClient): Promise<{
  totalDocuments: number;
}> {
  try {
    const registry = await suiClient.getObject({
      id: REGISTRY_OBJECT_ID,
      options: {
        showContent: true,
      },
    });

    if (!registry.data?.content || registry.data.content.dataType !== 'moveObject') {
      return { totalDocuments: 0 };
    }

    const fields = registry.data.content.fields as any;
    
    return {
      totalDocuments: parseInt(fields.total_documents || '0'),
    };
  } catch (error) {
    console.error('Error fetching registry stats:', error);
    return { totalDocuments: 0 };
  }
}
