import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { SealClient } from "@mysten/seal";

// Define KeyServer type locally since it's not exported from @mysten/seal index
interface KeyServer {
  objectId: Uint8Array;
  name: string;
  url: string;
  keyType: number;
  pk: Uint8Array;
}

// Load configuration from environment variables
const getEnvVar = (key: string, fallback?: string): string => {
  const value = import.meta.env[key];
  if (!value && !fallback) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value || fallback!;
};

// Your deployed smart contract package ID (from .env)
export const PACKAGE_ID = getEnvVar(
  'VITE_PACKAGE_ID'
);

// Document Registry Object ID (from .env)
export const REGISTRY_OBJECT_ID = getEnvVar(
  'VITE_REGISTRY_OBJECT_ID'
);

// Sui Client Configuration
export const suiClient = new SuiClient({
  url: getFullnodeUrl("testnet"),
});

// Walrus Configuration (Testnet) - from .env
export const WALRUS_CONFIG = {
  aggregatorUrl: getEnvVar(
    'VITE_WALRUS_AGGREGATOR_URL',
  ),
  publisherUrl: getEnvVar(
    'VITE_WALRUS_PUBLISHER_URL',
  ),
};

// Seal key server object IDs (comma separated, from .env)
export const SEAL_KEY_SERVERS = getEnvVar('VITE_SEAL_KEY_SERVERS')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);

// Number of key servers that must agree before a key is released
export const SEAL_THRESHOLD = Math.min(2, SEAL_KEY_SERVERS.length);

let sealClient: SealClient | null = null;

/**
 * Shared Seal client used for document and discussion encryption.
 * Created lazily so importing the config has no side effects.
 */
export function getSealClient(): SealClient {
  if (!sealClient) {
    sealClient = new SealClient({
      suiClient: suiClient as any,
      serverConfigs: SEAL_KEY_SERVERS.map((objectId) => ({ objectId, weight: 1 })),
      verifyKeyServers: true,
    });
  }
  return sealClient;
}

// Export KeyServer type for use in other modules
export type { KeyServer };

