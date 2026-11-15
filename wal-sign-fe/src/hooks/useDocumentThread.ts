import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useCurrentAccount,
  useSignAndExecuteTransactionBlock,
  useSignPersonalMessage,
} from '@mysten/dapp-kit';
import { SessionKey } from '@mysten/seal';
import { PACKAGE_ID, suiClient } from '../config/seal.config';
import { DocumentSummary } from '../services/registryService';
import {
  buildCreateThreadTx,
  buildPostMessageTx,
  decryptMessages,
  DecryptedMessages,
  encryptMessage,
  findThreadId,
  getThread,
  getThreadMessages,
  ThreadMessage,
  validateMessage,
} from '../services/discussionService';

const SESSION_TTL_MIN = 10;

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/**
 * Loads, decrypts and posts to the encrypted discussion of a document.
 *
 * Ciphertext is public on chain, so loading needs no wallet interaction;
 * reading requires one personal-message signature per session, and only
 * the document's participants are granted keys by the Seal policy.
 */
export function useDocumentThread(document: DocumentSummary | null) {
  const currentAccount = useCurrentAccount();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransactionBlock();

  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [plaintexts, setPlaintexts] = useState<DecryptedMessages>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionKeyRef = useRef<SessionKey | null>(null);

  const documentId = document?.documentId ?? null;
  const address = currentAccount?.address;
  const isParticipant =
    !!address && !!document && (document.creator === address || document.authorizedSigners.includes(address));

  const load = useCallback(async () => {
    if (!documentId) return;
    setIsLoading(true);
    setError(null);
    try {
      const id = await findThreadId(suiClient, documentId);
      setThreadId(id);
      if (!id) {
        setMessages([]);
        return;
      }
      const thread = await getThread(suiClient, id);
      setMessages(await getThreadMessages(suiClient, thread.messagesTableId));
    } catch (err) {
      setError(errorMessage(err, 'Failed to load the discussion'));
    } finally {
      setIsLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    setThreadId(null);
    setMessages([]);
    setPlaintexts({});
    setIsUnlocked(false);
    load();
  }, [load]);

  // A session key is bound to one address
  useEffect(() => {
    sessionKeyRef.current = null;
    setPlaintexts({});
    setIsUnlocked(false);
  }, [address]);

  const getSessionKey = useCallback(async () => {
    if (!address) throw new Error('Wallet not connected');
    const cached = sessionKeyRef.current;
    if (cached && !cached.isExpired()) return cached;

    const sessionKey = await SessionKey.create({
      address,
      packageId: PACKAGE_ID,
      ttlMin: SESSION_TTL_MIN,
      suiClient,
    });
    const { signature } = await signPersonalMessage({ message: sessionKey.getPersonalMessage() });
    await sessionKey.setPersonalMessageSignature(signature);
    sessionKeyRef.current = sessionKey;
    return sessionKey;
  }, [address, signPersonalMessage]);

  const unlock = useCallback(async () => {
    if (!documentId || !threadId) return;
    if (!isParticipant) {
      setError('Only participants of this document can read the discussion');
      return;
    }
    setIsUnlocking(true);
    setError(null);
    try {
      const sessionKey = await getSessionKey();
      const decrypted = await decryptMessages(suiClient, threadId, documentId, messages, sessionKey);
      setPlaintexts((prev) => ({ ...prev, ...decrypted }));
      setIsUnlocked(true);
    } catch (err) {
      setError(errorMessage(err, 'Failed to decrypt the discussion'));
    } finally {
      setIsUnlocking(false);
    }
  }, [documentId, threadId, isParticipant, getSessionKey, messages]);

  /** Encrypts and posts a message, opening the thread first if needed. Returns true on success. */
  const post = useCallback(
    async (text: string): Promise<boolean> => {
      if (!documentId) return false;
      if (!isParticipant) {
        setError('Only participants of this document can post to the discussion');
        return false;
      }
      const validationError = validateMessage(text);
      if (validationError) {
        setError(validationError);
        return false;
      }

      setIsPosting(true);
      setError(null);
      try {
        let id = threadId;
        if (!id) {
          const created: any = await signAndExecute({
            transactionBlock: buildCreateThreadTx(documentId) as any,
            options: { showObjectChanges: true },
          });
          const thread = created.objectChanges?.find(
            (change: any) => change.type === 'created' && change.objectType?.endsWith('::discussion::Thread'),
          );
          if (!thread) throw new Error('Failed to open the discussion thread');
          id = thread.objectId as string;
          setThreadId(id);
        }

        const ciphertext = await encryptMessage(id, text);
        const result: any = await signAndExecute({
          transactionBlock: buildPostMessageTx(id, documentId, ciphertext) as any,
          options: { showEvents: true },
        });

        const posted = result.events?.find((event: any) => event.type?.endsWith('::discussion::MessagePosted'));
        const index = posted ? Number(posted.parsedJson.index) : messages.length;
        const postedAt = posted ? Number(posted.parsedJson.timestamp) : Date.now();
        setMessages((prev) => [
          ...prev.filter((m) => m.index !== index),
          { index, sender: address!, ciphertext, postedAt },
        ]);
        setPlaintexts((prev) => ({ ...prev, [index]: text.trim() }));
        return true;
      } catch (err) {
        setError(errorMessage(err, 'Failed to post the message'));
        return false;
      } finally {
        setIsPosting(false);
      }
    },
    [documentId, isParticipant, threadId, signAndExecute, messages.length, address],
  );

  return {
    threadId,
    messages,
    plaintexts,
    isParticipant,
    isLoading,
    isUnlocking,
    isUnlocked,
    isPosting,
    error,
    reload: load,
    unlock,
    post,
  };
}
