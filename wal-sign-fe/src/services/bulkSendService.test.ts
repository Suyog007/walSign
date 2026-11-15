import { beforeEach, describe, expect, it, vi } from 'vitest';

const tx = vi.hoisted(() => ({ moveCall: vi.fn() }));
vi.mock('@mysten/sui/transactions', () => ({
  Transaction: vi.fn(() => ({
    moveCall: tx.moveCall,
    object: (id: string) => ({ object: id }),
    pure: {
      string: (v: string) => ({ string: v }),
      vector: (_t: string, v: unknown) => ({ vector: v }),
      bool: (v: boolean) => ({ bool: v }),
      u64: (v: number) => ({ u64: v }),
    },
  })),
}));

import {
  buildCreateDocumentsTx,
  buildFinalizeDocumentsTx,
  extractCreatedDocumentIds,
  MAX_DOCUMENTS_PER_SEND,
  planDocuments,
} from './bulkSendService';

const A = '0x' + 'a'.repeat(64);
const B = '0x' + 'b'.repeat(64);

beforeEach(() => tx.moveCall.mockClear());

describe('planDocuments', () => {
  it('keeps the title for a single document', () => {
    expect(planDocuments(' Lease ', [[A, B]])).toEqual([{ title: 'Lease', signers: [A, B] }]);
  });

  it('adds the first recipient to each title when sending many', () => {
    expect(planDocuments('NDA', [[A], [B]]).map((d) => d.title)).toEqual(['NDA - 0xaaaa...aaaa', 'NDA - 0xbbbb...bbbb']);
  });
});

describe('buildCreateDocumentsTx', () => {
  it('creates every document in one transaction', () => {
    buildCreateDocumentsTx(planDocuments('NDA', [[A], [B]]));
    expect(tx.moveCall).toHaveBeenCalledTimes(2);
    expect(tx.moveCall.mock.calls[1][0]).toEqual({
      target: '0xpackage::wal_sign::create_document',
      arguments: [
        { object: '0xregistry' },
        { string: '' },
        { string: 'NDA - 0xbbbb...bbbb' },
        { string: '' },
        { vector: [B] },
        { object: '0x6' },
      ],
    });
  });

  it('rejects empty and oversized sends', () => {
    expect(() => buildCreateDocumentsTx([])).toThrow('at least one recipient');
    const many = Array.from({ length: MAX_DOCUMENTS_PER_SEND + 1 }, () => ({ title: 't', signers: [A] }));
    expect(() => buildCreateDocumentsTx(many)).toThrow(`at most ${MAX_DOCUMENTS_PER_SEND}`);
  });
});

describe('extractCreatedDocumentIds', () => {
  it('returns document ids in creation order', () => {
    expect(
      extractCreatedDocumentIds({
        events: [
          { type: '0xpackage::wal_sign::DocumentCreated', parsedJson: { document_id: '0xd1' } },
          { type: '0x2::other::Event', parsedJson: {} },
          { type: '0xpackage::wal_sign::DocumentCreated', parsedJson: { document_id: '0xd2' } },
        ],
      }),
    ).toEqual(['0xd1', '0xd2']);
    expect(extractCreatedDocumentIds({ events: null })).toEqual([]);
  });
});

describe('buildFinalizeDocumentsTx', () => {
  it('records each blob and applies the signing rules per document', () => {
    buildFinalizeDocumentsTx(
      [
        { documentId: '0xd1', walrusBlobId: 'b1' },
        { documentId: '0xd2', walrusBlobId: 'b2' },
      ],
      { sequential: true },
    );
    expect(tx.moveCall.mock.calls.map((c) => [c[0].target.split('::').pop(), c[0].arguments[0]])).toEqual([
      ['update_blob_id', { object: '0xd1' }],
      ['set_signing_order', { object: '0xd1' }],
      ['update_blob_id', { object: '0xd2' }],
      ['set_signing_order', { object: '0xd2' }],
    ]);
  });
});
