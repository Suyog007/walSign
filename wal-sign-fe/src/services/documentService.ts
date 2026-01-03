import { SealClient, SessionKey, EncryptedObject } from "@mysten/seal";
import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { fromHex } from "@mysten/bcs";
import { suiClient } from "../config/seal.config";

// Key server list for Seal client  
const KEY_SERVER_LIST_TESTNET = [
  "0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75",
  "0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8"
];

const sealClient = new SealClient({
  suiClient: suiClient as any,
  serverConfigs: KEY_SERVER_LIST_TESTNET.map((id: string) => ({
    objectId: id,
    weight: 1,
  })),
  verifyKeyServers: true,
});

/**
 * Encrypt PDF file using Seal
 */
export async function encryptPDF(
  packageId: string,
  documentId: string,
  pdfFile: File
): Promise<{
  encryptedData: Uint8Array;
}> {
  const arrayBuffer = await pdfFile.arrayBuffer();
  const pdfBytes = new Uint8Array(arrayBuffer);

  const { encryptedObject } = await sealClient.encrypt({
    threshold: 2,
    packageId,
    id: documentId,
    data: pdfBytes,
  });

  return {
    encryptedData: encryptedObject,
  };
}

/**
 * Decrypt PDF using Seal and Session Key
 */
export async function decryptPDF(
  packageId: string,
  suiClient: SuiClient,
  documentId: string,
  encryptedBytes: Uint8Array,
  sessionKey: SessionKey,
  signPersonalMessage: (args: { message: Uint8Array }) => Promise<{ signature: string }>,
): Promise<Uint8Array | undefined> {
  try {
    // Parse encrypted object
    const encryptedObject = EncryptedObject.parse(encryptedBytes);

    // Get message wallet must sign
    const personalMessage = sessionKey.getPersonalMessage();
    const messageBytes = personalMessage;

    // Sign with connected wallet (wallet popup will appear)
    const { signature } = await signPersonalMessage({
      message: messageBytes, 
    });

    // Attach signature to session key
    sessionKey.setPersonalMessageSignature(signature);

    // Build the approval TX (SEAL requires this)
    const tx = new Transaction();
    tx.moveCall({
      target: `${packageId}::wal_sign::seal_approve`,
      arguments: [
        tx.pure.vector("u8", fromHex(encryptedObject.id)),
        tx.object(documentId),
      ],
    });

    const txBytes = await tx.build({
      client: suiClient,
      onlyTransactionKind: true,
    });

    // Fetch key shares
    await sealClient.fetchKeys({
      ids: [encryptedObject.id],
      txBytes,
      sessionKey,
      threshold: encryptedObject.threshold,
    });

    // Decrypt PDF
    const decrypted = await sealClient.decrypt({
      data: encryptedBytes,
      sessionKey,
      txBytes,
      checkShareConsistency: true,
    });

    return decrypted;

  } catch (err) {
    console.error("SEAL DECRYPT FAILED:", err);
    throw err;
  }
}
