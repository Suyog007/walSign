import { WALRUS_CONFIG } from '../config/seal.config';

export interface WalrusUploadResponse {
  blobId: string;
  newlyCreated?: {
    blobObject: {
      id: string;
      blobId: string;
    };
  };
  alreadyCertified?: {
    blobId: string;
  };
}

/**
 * Upload encrypted data to Walrus
 */
export async function uploadToWalrus(
  encryptedData: Uint8Array,
  epochs: number = 5 // Default to 5 epochs (approximately 30 days on testnet)
): Promise<string> {
  try {
    // Convert Uint8Array to Blob properly by creating a new Uint8Array if needed
    const dataArray = new Uint8Array(encryptedData);
    const blob = new Blob([dataArray.buffer], { type: 'application/octet-stream' });
    
    // Walrus requires the epochs parameter for storage duration
    const storeUrl = `${WALRUS_CONFIG.publisherUrl}/v1/blobs?epochs=3`;
    
    const response = await fetch(storeUrl, {
      method: 'PUT',
      body: blob,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Walrus upload failed:", errorText);
      throw new Error(`Walrus upload failed (${response.status}): ${response.statusText}. Details: ${errorText}`);
    }

    const result: WalrusUploadResponse = await response.json();
    
    // Extract blob ID from response
    const blobId = result.newlyCreated?.blobObject?.blobId 
      || result.alreadyCertified?.blobId 
      || result.blobId;

    if (!blobId) {
      console.error("Failed to get blob ID from Walrus response:", JSON.stringify(result, null, 2));
      throw new Error('Failed to get blob ID from Walrus response');
    }

    return blobId;
  } catch (error) {
    console.error('Error uploading to Walrus:', error);
    throw error;
  }
}

/**
 * Download encrypted data from Walrus
 */
export async function downloadFromWalrus(
  blobId: string
): Promise<Uint8Array> {
  try {
    // Validate blob ID
    if (!blobId || blobId.trim() === '') {
      throw new Error('Blob ID is empty');
    }

    const downloadUrl = `${WALRUS_CONFIG.aggregatorUrl}/v1/blobs/${blobId}`;
    
    const response = await fetch(downloadUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/octet-stream',
      },
    });

    if (!response.ok) {
      let errorText = '';
      try {
        errorText = await response.text();
      } catch (e) {
        // Ignore error reading response
      }
      
      if (response.status === 404) {
        throw new Error(`Blob not found on Walrus: ${blobId}`);
      } else if (response.status === 0) {
        throw new Error(`Network error or CORS issue. Check if Walrus aggregator is accessible.`);
      } else {
        throw new Error(`Walrus download failed (${response.status}): ${response.statusText}. ${errorText}`);
      }
    }

    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } catch (error) {
    console.error('Walrus download error:', error);
    throw error;
  }
}

/**
 * Check if blob exists on Walrus
 */
export async function checkBlobExists(blobId: string): Promise<boolean> {
  try {
    const response = await fetch(
      `${WALRUS_CONFIG.aggregatorUrl}/v1/blobs/${blobId}`,
      { method: 'HEAD' }
    );
    return response.ok;
  } catch (error) {
    console.error('Error checking blob:', error);
    return false;
  }
}

