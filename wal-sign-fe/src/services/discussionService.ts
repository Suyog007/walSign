import { EncryptedObject, SessionKey } from '@mysten/seal';
import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { fromBase64, fromHex, toHex } from '@mysten/bcs';
import { getSealClient, PACKAGE_ID, SEAL_THRESHOLD } from '../config/seal.config';
import { getDynamicFieldValue } from './dynamicFields';

/** Maximum length of a message as typed by the user */
export const MAX_MESSAGE_LENGTH = 2000;
/** Must match MAX_MESSAGE_BYTES in the discussion Move module */
export const MAX_CIPHERTEXT_BYTES = 8192;

const CLOCK_OBJECT_ID = '0x6';
const PAGE_SIZE = 50;

export interface ThreadInfo {
  threadId: string;
  documentId: string;
  messagesTableId: string;
  messageCount: number;
}

export interface ThreadMessage {
  index: number;
  sender: string;
  ciphertext: Uint8Array;
  postedAt: number;
}

/** Decrypted message bodies by index; `null` marks a message that could not be decrypted */
export type DecryptedMessages = Record<number, string | null>;

/**
 * Find the discussion thread attached to a document, if one was opened.
 * The thread ID lives in a `discussion::ThreadKey` dynamic field on the document.
 */
export async function findThreadId(suiClient: SuiClient, documentId: string): Promise<string | null> {
  return getDynamicFieldValue(suiClient, documentId, '::discussion::ThreadKey');
}

/** Read a thread object */
export async function getThread(suiClient: SuiClient, threadId: string): Promise<ThreadInfo> {
  const object = await suiClient.getObject({ id: threadId, options: { showContent: true } });
  const content = object.data?.content;
  if (content?.dataType !== 'moveObject') {
    throw new Error(`Discussion thread not found: ${threadId}`);
  }
  const fields = content.fields as any;
  return {
    threadId,
    documentId: fields.document_id,
    messagesTableId: fields.messages.fields.id.id,
    messageCount: Number(fields.messages.fields.size),
  };
}

/** Load every message of a thread, oldest first */
export async function getThreadMessages(suiClient: SuiClient, messagesTableId: string): Promise<ThreadMessage[]> {
  const fieldIds: string[] = [];
  let cursor: string | null | undefined = null;
  do {
    const page = await suiClient.getDynamicFields({ parentId: messagesTableId, cursor, limit: PAGE_SIZE });
    fieldIds.push(...page.data.map((field) => field.objectId));
    cursor = page.hasNextPage ? page.nextCursor : null;
  } while (cursor);

  const messages: ThreadMessage[] = [];
  for (let i = 0; i < fieldIds.length; i += PAGE_SIZE) {
    const objects = await suiClient.multiGetObjects({
      ids: fieldIds.slice(i, i + PAGE_SIZE),
      options: { showContent: true },
    });
    for (const object of objects) {
      const content = object.data?.content;
      if (content?.dataType !== 'moveObject') continue;
      const fields = content.fields as any;
      const message = fields.value.fields ?? fields.value;
      messages.push({
        index: Number(fields.name),
        sender: message.sender,
        ciphertext: toBytes(message.ciphertext),
        postedAt: Number(message.posted_at),
      });
    }
  }

  return messages.sort((a, b) => a.index - b.index);
}

/** Validate a draft message; returns an error message or null when it can be sent */
export function validateMessage(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return 'Message cannot be empty';
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return `Message is too long (${trimmed.length}/${MAX_MESSAGE_LENGTH} characters)`;
  }
  return null;
}

/** Seal key id for a new message: the thread ID followed by a random nonce */
export function createMessageKeyId(threadId: string): string {
  const nonce = crypto.getRandomValues(new Uint8Array(16));
  return toHex(fromHex(threadId)) + toHex(nonce);
}

/** Encrypt a message so only the document's participants can read it */
export async function encryptMessage(threadId: string, text: string): Promise<Uint8Array> {
  const validationError = validateMessage(text);
  if (validationError) throw new Error(validationError);

  const { encryptedObject } = await getSealClient().encrypt({
    threshold: SEAL_THRESHOLD,
    packageId: PACKAGE_ID,
    id: createMessageKeyId(threadId),
    data: new TextEncoder().encode(text.trim()),
  });

  if (encryptedObject.length > MAX_CIPHERTEXT_BYTES) {
    throw new Error('Message is too long to store on chain');
  }
  return encryptedObject;
}

/**
 * Decrypt a batch of thread messages with one key request.
 * Messages that fail to parse or decrypt are returned as `null` instead of failing the batch.
 */
export async function decryptMessages(
  suiClient: SuiClient,
  threadId: string,
  documentId: string,
  messages: ThreadMessage[],
  sessionKey: SessionKey,
): Promise<DecryptedMessages> {
  const result: DecryptedMessages = {};
  const parsed: Array<{ message: ThreadMessage; id: string }> = [];

  for (const message of messages) {
    try {
      parsed.push({ message, id: EncryptedObject.parse(message.ciphertext).id });
    } catch {
      result[message.index] = null;
    }
  }
  if (parsed.length === 0) return result;

  const ids = [...new Set(parsed.map((p) => p.id))];
  const tx = new Transaction();
  for (const id of ids) {
    tx.moveCall({
      target: `${PACKAGE_ID}::discussion::seal_approve_thread`,
      arguments: [tx.pure.vector('u8', fromHex(id)), tx.object(threadId), tx.object(documentId)],
    });
  }
  const txBytes = await tx.build({ client: suiClient, onlyTransactionKind: true });

  const sealClient = getSealClient();
  await sealClient.fetchKeys({ ids, txBytes, sessionKey, threshold: SEAL_THRESHOLD });

  const decoder = new TextDecoder();
  for (const { message } of parsed) {
    try {
      const plaintext = await sealClient.decrypt({ data: message.ciphertext, sessionKey, txBytes });
      result[message.index] = decoder.decode(plaintext);
    } catch {
      result[message.index] = null;
    }
  }
  return result;
}

/** Transaction that opens the discussion thread of a document */
export function buildCreateThreadTx(documentId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::discussion::create_thread`,
    arguments: [tx.object(documentId), tx.object(CLOCK_OBJECT_ID)],
  });
  return tx;
}

/** Transaction that posts an encrypted message to a thread */
export function buildPostMessageTx(threadId: string, documentId: string, ciphertext: Uint8Array): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::discussion::post_message`,
    arguments: [
      tx.object(threadId),
      tx.object(documentId),
      tx.pure.vector('u8', ciphertext),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });
  return tx;
}

/** vector<u8> fields come back from the RPC as number arrays or base64 strings */
function toBytes(value: number[] | string): Uint8Array {
  return typeof value === 'string' ? fromBase64(value) : Uint8Array.from(value);
}
