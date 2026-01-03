export function truncateAddress(address: string): string {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Alias for truncateAddress (commonly used name)
export function formatAddress(address: string): string {
  return truncateAddress(address);
}

export function isValidSuiAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40,64}$/.test(address);
}

/**
 * Generates a proper sign URL for a document
 * @param documentId - The document ID to sign
 * @param useQueryParam - If true, uses query param format (?documentId=...), otherwise uses path param format (/sign/...)
 * @returns A properly formatted URL
 */
export function getSignUrl(documentId: string, useQueryParam: boolean = false): string {
  if (!documentId || documentId.trim() === '') {
    return ''; // Return empty string instead of throwing error
  }

  // Get the origin, ensuring it's properly formatted
  const origin = typeof window !== 'undefined' 
    ? window.location.origin 
    : 'http://localhost:5174';
  
  // Ensure origin has proper protocol
  const baseUrl = origin.startsWith('http://') || origin.startsWith('https://')
    ? origin
    : `http://${origin}`;
  
  // Remove trailing slash if present
  const cleanBaseUrl = baseUrl.replace(/\/$/, '');
  
  if (useQueryParam) {
    return `${cleanBaseUrl}/sign?documentId=${documentId}`;
  } else {
    return `${cleanBaseUrl}/sign/${documentId}`;
  }
}

