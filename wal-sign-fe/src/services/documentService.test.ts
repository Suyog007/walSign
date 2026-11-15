import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionKey } from '@mysten/seal';
import type { SuiClient } from '@mysten/sui/client';

const seal = vi.hoisted(() => ({
  encrypt: vi.fn(),
  fetchKeys: vi.fn(),
  decrypt: vi.fn(),
  parse: vi.fn(),
}));

const tx = vi.hoisted(() => ({
  moveCall: vi.fn(),
  build: vi.fn(),
}));

vi.mock('@mysten/seal', () => ({
  SealClient: vi.fn(() => ({ encrypt: seal.encrypt, fetchKeys: seal.fetchKeys, decrypt: seal.decrypt })),
  EncryptedObject: { parse: seal.parse },
}));

vi.mock('@mysten/sui/transactions', () => ({
  Transaction: vi.fn(() => ({
    moveCall: tx.moveCall,
    build: tx.build,
    object: (id: string) => ({ object: id }),
    pure: { vector: (type: string, value: unknown) => ({ vector: type, value }) },
  })),
}));

import { decryptPDF, encryptPDF } from './documentService';

const suiClient = {} as SuiClient;

function makeSessionKey() {
  return {
    getPersonalMessage: vi.fn(() => new Uint8Array([1, 2])),
    setPersonalMessageSignature: vi.fn(),
  } as unknown as SessionKey & {
    getPersonalMessage: ReturnType<typeof vi.fn>;
    setPersonalMessageSignature: ReturnType<typeof vi.fn>;
  };
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('encryptPDF', () => {
  it('encrypts the file bytes under the document id with a 2-of-n threshold', async () => {
    seal.encrypt.mockResolvedValue({ encryptedObject: new Uint8Array([42]) });
    const file = new File([new Uint8Array([1, 2, 3])], 'doc.pdf', { type: 'application/pdf' });

    const result = await encryptPDF('0xpkg', '0xdoc', file);

    expect(result.encryptedData).toEqual(new Uint8Array([42]));
    const args = seal.encrypt.mock.calls[0][0];
    expect(args).toMatchObject({ threshold: 2, packageId: '0xpkg', id: '0xdoc' });
    expect(Array.from(args.data)).toEqual([1, 2, 3]);
  });
});

describe('decryptPDF', () => {
  it('signs the session key, proves access with seal_approve and decrypts', async () => {
    seal.parse.mockReturnValue({ id: 'abcd', threshold: 2 });
    tx.build.mockResolvedValue(new Uint8Array([7]));
    seal.decrypt.mockResolvedValue(new Uint8Array([5, 5]));
    const sessionKey = makeSessionKey();
    const signPersonalMessage = vi.fn().mockResolvedValue({ signature: 'sig' });

    const result = await decryptPDF('0xpkg', suiClient, '0xdoc', new Uint8Array([0]), sessionKey, signPersonalMessage);

    expect(result).toEqual(new Uint8Array([5, 5]));
    expect(signPersonalMessage).toHaveBeenCalledWith({ message: new Uint8Array([1, 2]) });
    expect(sessionKey.setPersonalMessageSignature).toHaveBeenCalledWith('sig');

    const call = tx.moveCall.mock.calls[0][0];
    expect(call.target).toBe('0xpkg::wal_sign::seal_approve');
    expect(Array.from(call.arguments[0].value)).toEqual([0xab, 0xcd]);
    expect(call.arguments[1]).toEqual({ object: '0xdoc' });
    expect(tx.build).toHaveBeenCalledWith({ client: suiClient, onlyTransactionKind: true });

    expect(seal.fetchKeys).toHaveBeenCalledWith(
      expect.objectContaining({ ids: ['abcd'], threshold: 2, sessionKey }),
    );
  });

  it('propagates a rejected wallet signature without contacting key servers', async () => {
    seal.parse.mockReturnValue({ id: 'abcd', threshold: 2 });
    const signPersonalMessage = vi.fn().mockRejectedValue(new Error('User rejected'));

    await expect(
      decryptPDF('0xpkg', suiClient, '0xdoc', new Uint8Array([0]), makeSessionKey(), signPersonalMessage),
    ).rejects.toThrow('User rejected');
    expect(seal.fetchKeys).not.toHaveBeenCalled();
  });

  it('propagates an access denial from the key servers', async () => {
    seal.parse.mockReturnValue({ id: 'abcd', threshold: 2 });
    tx.build.mockResolvedValue(new Uint8Array([7]));
    seal.fetchKeys.mockRejectedValue(new Error('NoAccessError'));
    const signPersonalMessage = vi.fn().mockResolvedValue({ signature: 'sig' });

    await expect(
      decryptPDF('0xpkg', suiClient, '0xdoc', new Uint8Array([0]), makeSessionKey(), signPersonalMessage),
    ).rejects.toThrow('NoAccessError');
    expect(seal.decrypt).not.toHaveBeenCalled();
  });
});
