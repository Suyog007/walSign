import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentSummary } from '../services/registryService';

const mocks = vi.hoisted(() => ({
  account: null as { address: string } | null,
  signPersonalMessage: vi.fn(),
  signAndExecute: vi.fn(),
  createSessionKey: vi.fn(),
  findThreadId: vi.fn(),
  getThread: vi.fn(),
  getThreadMessages: vi.fn(),
  decryptMessages: vi.fn(),
  encryptMessage: vi.fn(),
}));

vi.mock('@mysten/dapp-kit', () => ({
  useCurrentAccount: () => mocks.account,
  useSignPersonalMessage: () => ({ mutateAsync: mocks.signPersonalMessage }),
  useSignAndExecuteTransactionBlock: () => ({ mutateAsync: mocks.signAndExecute }),
}));
vi.mock('@mysten/seal', () => ({ SessionKey: { create: mocks.createSessionKey } }));
vi.mock('../services/discussionService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/discussionService')>();
  return {
    validateMessage: actual.validateMessage,
    buildCreateThreadTx: (documentId: string) => ({ kind: 'create', documentId }),
    buildPostMessageTx: (threadId: string) => ({ kind: 'post', threadId }),
    findThreadId: mocks.findThreadId,
    getThread: mocks.getThread,
    getThreadMessages: mocks.getThreadMessages,
    decryptMessages: mocks.decryptMessages,
    encryptMessage: mocks.encryptMessage,
  };
});

import { useDocumentThread } from './useDocumentThread';

const document = {
  documentId: '0xdoc',
  creator: '0xalice',
  authorizedSigners: ['0xbob'],
} as DocumentSummary;

const storedMessage = { index: 0, sender: '0xalice', ciphertext: new Uint8Array([1]), postedAt: 10 };

function sessionKey() {
  return {
    isExpired: () => false,
    getPersonalMessage: () => new Uint8Array([1]),
    setPersonalMessageSignature: vi.fn(),
  };
}

beforeEach(() => {
  mocks.account = { address: '0xbob' };
  mocks.findThreadId.mockResolvedValue('0xthread');
  mocks.getThread.mockResolvedValue({ messagesTableId: '0xtable' });
  mocks.getThreadMessages.mockResolvedValue([storedMessage]);
  mocks.signPersonalMessage.mockResolvedValue({ signature: 'sig' });
});

async function renderLoaded(doc: DocumentSummary | null = document) {
  const hook = renderHook(() => useDocumentThread(doc));
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  return hook;
}

describe('useDocumentThread', () => {
  it('loads the encrypted messages without asking the wallet', async () => {
    const { result } = await renderLoaded();

    expect(mocks.findThreadId).toHaveBeenCalledWith(expect.anything(), '0xdoc');
    expect(mocks.getThreadMessages).toHaveBeenCalledWith(expect.anything(), '0xtable');
    expect(result.current.threadId).toBe('0xthread');
    expect(result.current.messages).toEqual([storedMessage]);
    expect(result.current.isUnlocked).toBe(false);
    expect(result.current.isParticipant).toBe(true);
    expect(mocks.signPersonalMessage).not.toHaveBeenCalled();
  });

  it('is empty when the document has no thread yet', async () => {
    mocks.findThreadId.mockResolvedValue(null);
    const { result } = await renderLoaded();

    expect(result.current.threadId).toBeNull();
    expect(result.current.messages).toEqual([]);
    expect(mocks.getThread).not.toHaveBeenCalled();
  });

  it('reports load failures', async () => {
    mocks.findThreadId.mockRejectedValue(new Error('rpc down'));
    const { result } = await renderLoaded();
    expect(result.current.error).toBe('rpc down');
  });

  it('decrypts the thread after one wallet signature and reuses the session', async () => {
    const key = sessionKey();
    mocks.createSessionKey.mockResolvedValue(key);
    mocks.decryptMessages.mockResolvedValue({ 0: 'Please review page 2' });
    const { result } = await renderLoaded();

    await act(() => result.current.unlock());
    await act(() => result.current.unlock());

    expect(result.current.isUnlocked).toBe(true);
    expect(result.current.plaintexts).toEqual({ 0: 'Please review page 2' });
    expect(mocks.createSessionKey).toHaveBeenCalledTimes(1);
    expect(mocks.signPersonalMessage).toHaveBeenCalledTimes(1);
    expect(key.setPersonalMessageSignature).toHaveBeenCalledWith('sig');
    expect(mocks.decryptMessages).toHaveBeenCalledWith(expect.anything(), '0xthread', '0xdoc', [storedMessage], key);
  });

  it('keeps the thread locked when decryption is denied', async () => {
    mocks.createSessionKey.mockResolvedValue(sessionKey());
    mocks.decryptMessages.mockRejectedValue(new Error('NoAccessError'));
    const { result } = await renderLoaded();

    await act(() => result.current.unlock());

    expect(result.current.isUnlocked).toBe(false);
    expect(result.current.error).toBe('NoAccessError');
  });

  it('does not let outsiders unlock or post', async () => {
    mocks.account = { address: '0xmallory' };
    const { result } = await renderLoaded();

    expect(result.current.isParticipant).toBe(false);
    await act(() => result.current.unlock());
    expect(mocks.createSessionKey).not.toHaveBeenCalled();

    let posted = true;
    await act(async () => {
      posted = await result.current.post('hi');
    });
    expect(posted).toBe(false);
    expect(mocks.signAndExecute).not.toHaveBeenCalled();
  });

  it('opens the thread on the first message, then posts it', async () => {
    mocks.findThreadId.mockResolvedValue(null);
    mocks.encryptMessage.mockResolvedValue(new Uint8Array([9]));
    mocks.signAndExecute
      .mockResolvedValueOnce({
        objectChanges: [{ type: 'created', objectType: '0xpackage::discussion::Thread', objectId: '0xnewthread' }],
      })
      .mockResolvedValueOnce({
        events: [{ type: '0xpackage::discussion::MessagePosted', parsedJson: { index: '0', timestamp: '55' } }],
      });
    const { result } = await renderLoaded();

    let posted = false;
    await act(async () => {
      posted = await result.current.post('  Looks good to me  ');
    });

    expect(posted).toBe(true);
    expect(mocks.signAndExecute.mock.calls[0][0].transactionBlock).toEqual({ kind: 'create', documentId: '0xdoc' });
    expect(mocks.encryptMessage).toHaveBeenCalledWith('0xnewthread', '  Looks good to me  ');
    expect(mocks.signAndExecute.mock.calls[1][0].transactionBlock).toEqual({ kind: 'post', threadId: '0xnewthread' });
    expect(result.current.threadId).toBe('0xnewthread');
    expect(result.current.messages).toEqual([
      { index: 0, sender: '0xbob', ciphertext: new Uint8Array([9]), postedAt: 55 },
    ]);
    expect(result.current.plaintexts[0]).toBe('Looks good to me');
  });

  it('validates drafts before touching the wallet', async () => {
    const { result } = await renderLoaded();

    await act(async () => {
      await result.current.post('   ');
    });

    expect(result.current.error).toBe('Message cannot be empty');
    expect(mocks.signAndExecute).not.toHaveBeenCalled();
  });

  it('surfaces a rejected post transaction', async () => {
    mocks.encryptMessage.mockResolvedValue(new Uint8Array([9]));
    mocks.signAndExecute.mockRejectedValue(new Error('User rejected the request'));
    const { result } = await renderLoaded();

    let posted = true;
    await act(async () => {
      posted = await result.current.post('hello');
    });

    expect(posted).toBe(false);
    expect(result.current.error).toBe('User rejected the request');
    expect(result.current.isPosting).toBe(false);
    expect(result.current.messages).toEqual([storedMessage]);
  });

  it('does nothing without a document', async () => {
    const { result } = await renderLoaded(null);
    expect(mocks.findThreadId).not.toHaveBeenCalled();
    expect(result.current.isParticipant).toBe(false);
  });
});
