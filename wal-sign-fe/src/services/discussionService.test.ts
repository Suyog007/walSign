import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionKey } from '@mysten/seal';
import type { SuiClient } from '@mysten/sui/client';

const seal = vi.hoisted(() => ({
  encrypt: vi.fn(),
  fetchKeys: vi.fn(),
  decrypt: vi.fn(),
  parse: vi.fn(),
}));
const tx = vi.hoisted(() => ({ moveCall: vi.fn(), build: vi.fn() }));

vi.mock('@mysten/seal', () => ({
  SealClient: vi.fn(() => ({ encrypt: seal.encrypt, fetchKeys: seal.fetchKeys, decrypt: seal.decrypt })),
  EncryptedObject: { parse: seal.parse },
}));
vi.mock('@mysten/sui/transactions', () => ({
  Transaction: vi.fn(() => ({
    moveCall: tx.moveCall,
    build: tx.build,
    object: (id: string) => ({ object: id }),
    pure: { vector: (type: string, value: unknown) => ({ vector: type, value: Array.from(value as Uint8Array) }) },
  })),
}));

import {
  buildCreateThreadTx,
  buildPostMessageTx,
  createMessageKeyId,
  decryptMessages,
  encryptMessage,
  findThreadId,
  getThread,
  getThreadMessages,
  MAX_MESSAGE_LENGTH,
  validateMessage,
} from './discussionService';

const THREAD_ID = '0x' + '11'.repeat(32);
const DOCUMENT_ID = '0x' + '22'.repeat(32);

const getDynamicFields = vi.fn();
const getDynamicFieldObject = vi.fn();
const getObject = vi.fn();
const multiGetObjects = vi.fn();
const client = { getDynamicFields, getDynamicFieldObject, getObject, multiGetObjects } as unknown as SuiClient;

const moveObject = (fields: Record<string, unknown>) => ({ data: { content: { dataType: 'moveObject', fields } } });

beforeEach(() => {
  getDynamicFields.mockReset();
  seal.fetchKeys.mockReset();
  seal.decrypt.mockReset();
  seal.parse.mockReset();
});

describe('findThreadId', () => {
  it('follows the ThreadKey dynamic field on the document', async () => {
    const name = { type: '0xpackage::discussion::ThreadKey', value: { dummy_field: false } };
    getDynamicFields
      .mockResolvedValueOnce({ data: [], hasNextPage: true, nextCursor: 'c1' })
      .mockResolvedValueOnce({ data: [{ name, objectId: '0xfield' }], hasNextPage: false, nextCursor: null });
    getDynamicFieldObject.mockResolvedValue(moveObject({ value: THREAD_ID }));

    await expect(findThreadId(client, DOCUMENT_ID)).resolves.toBe(THREAD_ID);
    expect(getDynamicFields.mock.calls[1][0]).toMatchObject({ parentId: DOCUMENT_ID, cursor: 'c1' });
    expect(getDynamicFieldObject).toHaveBeenCalledWith({ parentId: DOCUMENT_ID, name });
  });

  it('returns null when no thread was opened', async () => {
    getDynamicFields.mockResolvedValue({ data: [], hasNextPage: false, nextCursor: null });
    await expect(findThreadId(client, DOCUMENT_ID)).resolves.toBeNull();
  });
});

describe('reading threads', () => {
  it('reads the thread and its message table', async () => {
    getObject.mockResolvedValue(
      moveObject({ document_id: DOCUMENT_ID, messages: { fields: { id: { id: '0xtable' }, size: '3' } } }),
    );
    await expect(getThread(client, THREAD_ID)).resolves.toEqual({
      threadId: THREAD_ID,
      documentId: DOCUMENT_ID,
      messagesTableId: '0xtable',
      messageCount: 3,
    });
  });

  it('fails clearly for a missing thread', async () => {
    getObject.mockResolvedValue({ error: { code: 'notExists' } });
    await expect(getThread(client, THREAD_ID)).rejects.toThrow('Discussion thread not found');
  });

  it('returns messages oldest first and decodes both byte encodings', async () => {
    getDynamicFields.mockResolvedValue({
      data: [{ objectId: '0xm1' }, { objectId: '0xm0' }],
      hasNextPage: false,
      nextCursor: null,
    });
    multiGetObjects.mockResolvedValue([
      moveObject({ name: '1', value: { fields: { sender: '0xbob', ciphertext: 'AQI=', posted_at: '20' } } }),
      moveObject({ name: '0', value: { fields: { sender: '0xalice', ciphertext: [9, 9], posted_at: '10' } } }),
    ]);

    const messages = await getThreadMessages(client, '0xtable');

    expect(messages).toEqual([
      { index: 0, sender: '0xalice', ciphertext: new Uint8Array([9, 9]), postedAt: 10 },
      { index: 1, sender: '0xbob', ciphertext: new Uint8Array([1, 2]), postedAt: 20 },
    ]);
  });
});

describe('validateMessage', () => {
  it('accepts normal text', () => {
    expect(validateMessage('Can we change clause 4?')).toBeNull();
  });

  it('rejects blank and oversized drafts', () => {
    expect(validateMessage('   ')).toBe('Message cannot be empty');
    expect(validateMessage('a'.repeat(MAX_MESSAGE_LENGTH + 1))).toMatch(/too long/);
  });
});

describe('encryptMessage', () => {
  it('namespaces the key id under the thread and encrypts the trimmed text', async () => {
    seal.encrypt.mockResolvedValue({ encryptedObject: new Uint8Array([1, 2, 3]) });

    await expect(encryptMessage(THREAD_ID, '  hello  ')).resolves.toEqual(new Uint8Array([1, 2, 3]));

    const args = seal.encrypt.mock.calls[0][0];
    expect(args.packageId).toBe('0xpackage');
    expect(args.threshold).toBe(2);
    expect(args.id.startsWith('11'.repeat(32))).toBe(true);
    expect(new TextDecoder().decode(args.data)).toBe('hello');
  });

  it('uses a fresh nonce for every message', () => {
    expect(createMessageKeyId(THREAD_ID)).not.toBe(createMessageKeyId(THREAD_ID));
    expect(createMessageKeyId(THREAD_ID)).toHaveLength(64 + 32);
  });

  it('refuses invalid drafts and oversized ciphertext', async () => {
    await expect(encryptMessage(THREAD_ID, '')).rejects.toThrow('Message cannot be empty');
    seal.encrypt.mockResolvedValue({ encryptedObject: new Uint8Array(9000) });
    await expect(encryptMessage(THREAD_ID, 'hi')).rejects.toThrow('too long to store');
  });
});

describe('decryptMessages', () => {
  const sessionKey = {} as SessionKey;
  const message = (index: number) => ({ index, sender: '0xa', ciphertext: new Uint8Array([index]), postedAt: 0 });

  it('requests all keys in one call and decrypts every message', async () => {
    seal.parse.mockImplementation((bytes: Uint8Array) => ({ id: bytes[0] === 0 ? 'aa' : 'bb' }));
    tx.build.mockResolvedValue(new Uint8Array([7]));
    seal.decrypt.mockImplementation(async ({ data }: { data: Uint8Array }) =>
      new TextEncoder().encode(`text-${data[0]}`),
    );

    const result = await decryptMessages(client, THREAD_ID, DOCUMENT_ID, [message(0), message(1)], sessionKey);

    expect(result).toEqual({ 0: 'text-0', 1: 'text-1' });
    expect(tx.moveCall).toHaveBeenCalledTimes(2);
    const call = tx.moveCall.mock.calls[0][0];
    expect(call.target).toBe('0xpackage::discussion::seal_approve_thread');
    expect(call.arguments[0].value).toEqual([0xaa]);
    expect(call.arguments.slice(1)).toEqual([{ object: THREAD_ID }, { object: DOCUMENT_ID }]);
    expect(seal.fetchKeys).toHaveBeenCalledTimes(1);
    expect(seal.fetchKeys.mock.calls[0][0]).toMatchObject({ ids: ['aa', 'bb'], sessionKey, threshold: 2 });
  });

  it('marks unreadable messages instead of failing the batch', async () => {
    seal.parse.mockImplementation((bytes: Uint8Array) => {
      if (bytes[0] === 2) throw new Error('corrupt');
      return { id: 'aa' };
    });
    tx.build.mockResolvedValue(new Uint8Array([7]));
    seal.decrypt
      .mockResolvedValueOnce(new TextEncoder().encode('ok'))
      .mockRejectedValueOnce(new Error('bad share'));

    const result = await decryptMessages(client, THREAD_ID, DOCUMENT_ID, [message(0), message(1), message(2)], sessionKey);

    expect(result).toEqual({ 0: 'ok', 1: null, 2: null });
  });

  it('propagates an access denial from the key servers', async () => {
    seal.parse.mockReturnValue({ id: 'aa' });
    tx.build.mockResolvedValue(new Uint8Array([7]));
    seal.fetchKeys.mockRejectedValue(new Error('NoAccessError'));

    await expect(decryptMessages(client, THREAD_ID, DOCUMENT_ID, [message(0)], sessionKey)).rejects.toThrow(
      'NoAccessError',
    );
  });

  it('does nothing for an empty thread', async () => {
    await expect(decryptMessages(client, THREAD_ID, DOCUMENT_ID, [], sessionKey)).resolves.toEqual({});
    expect(seal.fetchKeys).not.toHaveBeenCalled();
  });
});

describe('transaction builders', () => {
  it('opens a thread with the document and the clock', () => {
    buildCreateThreadTx(DOCUMENT_ID);
    expect(tx.moveCall).toHaveBeenCalledWith({
      target: '0xpackage::discussion::create_thread',
      arguments: [{ object: DOCUMENT_ID }, { object: '0x6' }],
    });
  });

  it('posts the ciphertext to the thread', () => {
    buildPostMessageTx(THREAD_ID, DOCUMENT_ID, new Uint8Array([4, 5]));
    const call = tx.moveCall.mock.calls[0][0];
    expect(call.target).toBe('0xpackage::discussion::post_message');
    expect(call.arguments).toEqual([
      { object: THREAD_ID },
      { object: DOCUMENT_ID },
      { vector: 'u8', value: [4, 5] },
      { object: '0x6' },
    ]);
  });
});
