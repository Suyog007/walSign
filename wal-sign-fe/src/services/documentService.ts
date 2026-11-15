import { SessionKey, EncryptedObject } from "@mysten/seal";
import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { fromHex } from "@mysten/bcs";
import { getSealClient } from "../config/seal.config";

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

  const { encryptedObject } = await getSealClient().encrypt({
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
    await getSealClient().fetchKeys({
      ids: [encryptedObject.id],
      txBytes,
      sessionKey,
      threshold: encryptedObject.threshold,
    });

    // Decrypt PDF
    const decrypted = await getSealClient().decrypt({
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
