import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type { SuiClient } from '@mysten/sui/client';
import type { SessionKey } from '@mysten/seal';

const seal = vi.hoisted(() => ({ fetchKeys: vi.fn(), decrypt: vi.fn(), parse: vi.fn() }));
const tx = vi.hoisted(() => ({ moveCall: vi.fn(), makeMoveVec: vi.fn(), build: vi.fn() }));

vi.mock('@mysten/seal', () => ({
  SealClient: vi.fn(() => ({ fetchKeys: seal.fetchKeys, decrypt: seal.decrypt })),
  EncryptedObject: { parse: seal.parse },
}));
vi.mock('@mysten/sui/transactions', () => ({
  Transaction: vi.fn(() => {
    let n = 0;
    return {
      moveCall: (call: unknown) => {
        tx.moveCall(call);
        return { result: n++ };
      },
      makeMoveVec: (args: unknown) => {
        tx.makeMoveVec(args);
        return { vec: true };
      },
      build: tx.build,
      object: (id: string) => ({ object: id }),
      pure: {
        u64: (v: number) => v,
        bool: (v: boolean) => ({ bool: v }),
        string: (v: string) => ({ string: v }),
        vector: (type: string, value: unknown) => ({ vector: type, value }),
      },
    };
  }),
}));

import {
  buildCreateTemplateTx,
  buildDeleteTemplateTx,
  buildSetTemplateBlobTx,
  decryptTemplatePdf,
  listTemplates,
  parseRecipientRows,
  placeField,
  stampSignatureFields,
  TemplateDraft,
  validateTemplateDraft,
} from './templateService';

const A = '0x' + 'a'.repeat(64);
const B = '0x' + 'b'.repeat(64);

const draft: TemplateDraft = {
  name: ' Lease ',
  description: 'Standard lease',
  roles: ['Tenant', 'Landlord'],
  fields: [{ role: 1, page: 0, x: 10, y: 20, width: 180, height: 50 }],
  sequential: true,
};

beforeEach(() => {
  tx.moveCall.mockClear();
});

describe('listTemplates', () => {
  it('reads the owned templates, newest first', async () => {
    const getOwnedObjects = vi
      .fn()
      .mockResolvedValueOnce({
        data: [
          {
            data: {
              objectId: '0xt1',
              content: {
                dataType: 'moveObject',
                fields: {
                  name: 'Old',
                  description: '',
                  walrus_blob_id: 'b1',
                  roles: ['Signer'],
                  fields: [],
                  sequential: false,
                  created_at: '1',
                },
              },
            },
          },
        ],
        hasNextPage: true,
        nextCursor: 'c',
      })
      .mockResolvedValueOnce({
        data: [
          {
            data: {
              objectId: '0xt2',
              content: {
                dataType: 'moveObject',
                fields: {
                  name: 'Lease',
                  description: 'x',
                  walrus_blob_id: 'b2',
                  roles: ['Tenant', 'Landlord'],
                  fields: [{ fields: { role: '1', page: '0', x: '10', y: '20', width: '180', height: '50' } }],
                  sequential: true,
                  created_at: '5',
                },
              },
            },
          },
        ],
        hasNextPage: false,
        nextCursor: null,
      });

    const templates = await listTemplates({ getOwnedObjects } as unknown as SuiClient, A);

    expect(templates.map((t) => t.templateId)).toEqual(['0xt2', '0xt1']);
    expect(templates[0]).toMatchObject({
      name: 'Lease',
      roles: ['Tenant', 'Landlord'],
      fields: [{ role: 1, page: 0, x: 10, y: 20, width: 180, height: 50 }],
      sequential: true,
      walrusBlobId: 'b2',
    });
    expect(getOwnedObjects.mock.calls[0][0].filter).toEqual({ StructType: '0xpackage::template::Template' });
  });
});

describe('validateTemplateDraft', () => {
  it('accepts a complete draft', () => {
    expect(validateTemplateDraft(draft)).toBeNull();
  });

  it.each([
    [{ name: ' ' }, 'Give the template a name'],
    [{ name: 'x'.repeat(101) }, 'The name is too long'],
    [{ roles: [], fields: [] }, 'Add at least one signer role'],
    [{ roles: ['Tenant', ' '] }, 'Every role needs a name'],
    [{ roles: ['Tenant', 'tenant'] }, 'Role names must be unique'],
    [{ roles: ['Tenant'] }, 'A signature field belongs to a role that no longer exists'],
  ])('rejects %j', (overrides, message) => {
    expect(validateTemplateDraft({ ...draft, ...overrides })).toBe(message);
  });
});

describe('placeField', () => {
  it('centres the field on the click in PDF points', () => {
    // 1.5 px per point; click at (300, 300) px = (200, 200) pt
    expect(placeField(1, 2, { x: 300, y: 300 }, 1.5, { width: 595, height: 842 })).toEqual({
      role: 1,
      page: 2,
      x: 110,
      y: 175,
      width: 180,
      height: 50,
    });
  });

  it('keeps the field on the page', () => {
    const field = placeField(0, 0, { x: 2, y: 5000 }, 1, { width: 595, height: 842 });
    expect(field.x).toBe(0);
    expect(field.y).toBe(842 - 50);
  });
});

describe('transactions', () => {
  it('creates the template with its fields in one transaction', () => {
    buildCreateTemplateTx(draft);

    const calls = tx.moveCall.mock.calls.map((c) => c[0]);
    expect(calls[0]).toEqual({ target: '0xpackage::template::new_field', arguments: [1, 0, 10, 20, 180, 50] });
    expect(tx.makeMoveVec).toHaveBeenCalledWith({
      type: '0xpackage::template::SignatureField',
      elements: [{ result: 0 }],
    });
    expect(calls[1]).toEqual({
      target: '0xpackage::template::create_template',
      arguments: [
        { string: 'Lease' },
        { string: 'Standard lease' },
        { vector: 'string', value: ['Tenant', 'Landlord'] },
        { vec: true },
        { bool: true },
        { object: '0x6' },
      ],
    });
  });

  it('records the blob and deletes templates', () => {
    buildSetTemplateBlobTx('0xt', 'blob');
    buildDeleteTemplateTx('0xt');
    expect(tx.moveCall.mock.calls.map((c) => c[0].target)).toEqual([
      '0xpackage::template::set_blob_id',
      '0xpackage::template::delete_template',
    ]);
  });
});

describe('decryptTemplatePdf', () => {
  it('proves ownership with seal_approve_template', async () => {
    seal.parse.mockReturnValue({ id: 'abcd' });
    tx.build.mockResolvedValue(new Uint8Array([1]));
    seal.decrypt.mockResolvedValue(new Uint8Array([9]));
    const sessionKey = {} as SessionKey;

    await expect(decryptTemplatePdf({} as SuiClient, '0xt', new Uint8Array([0]), sessionKey)).resolves.toEqual(
      new Uint8Array([9]),
    );
    expect(tx.moveCall.mock.calls[0][0]).toEqual({
      target: '0xpackage::template::seal_approve_template',
      arguments: [{ vector: 'u8', value: new Uint8Array([0xab, 0xcd]) }, { object: '0xt' }],
    });
    expect(seal.fetchKeys).toHaveBeenCalledWith(expect.objectContaining({ ids: ['abcd'], sessionKey }));
  });
});

describe('stampSignatureFields', () => {
  it('returns the PDF unchanged without fields', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    await expect(stampSignatureFields(bytes, [], [])).resolves.toBe(bytes);
  });

  it('draws the fields onto a valid PDF and skips fields on missing pages', async () => {
    const source = await PDFDocument.create();
    source.addPage([595, 842]);
    const original = await source.save();

    const stamped = await stampSignatureFields(
      original,
      [
        { role: 0, page: 0, x: 50, y: 700, width: 180, height: 50 },
        { role: 1, page: 5, x: 0, y: 0, width: 10, height: 10 },
      ],
      ['Tenant ✍️', 'Landlord'],
    );

    expect(stamped.length).toBeGreaterThan(original.length);
    expect((await PDFDocument.load(stamped)).getPageCount()).toBe(1);
  });
});

describe('parseRecipientRows', () => {
  it('reads one document per line, ignoring blanks and comments', () => {
    const text = `# tenant, landlord\n${A}, ${B}\n\n${B} ${A}\n`;
    expect(parseRecipientRows(text, 2)).toEqual({ rows: [[A, B], [B, A]], errors: [] });
  });

  it('reports bad lines with their line number', () => {
    const text = [`${A}`, `${A}, 0x12`, `${A}, ${A}`, `${A}, ${B}`].join('\n');
    expect(parseRecipientRows(text, 2)).toEqual({
      rows: [[A, B]],
      errors: [
        'Line 1: expected 2 addresses, found 1',
        'Line 2: invalid Sui address',
        'Line 3: the same address is used for two roles',
      ],
    });
  });
});
