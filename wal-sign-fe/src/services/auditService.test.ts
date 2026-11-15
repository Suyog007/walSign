import { describe, expect, it, vi } from 'vitest';
import type { SuiClient } from '@mysten/sui/client';
import { getAuditTrail, parseAuditTrail, TransactionWithEvents } from './auditService';

const DOC = '0xdoc';
const PKG = '0xpkg';

const event = (type: string, sender: string, json: Record<string, unknown>) => ({
  type: `${PKG}::${type}`,
  sender,
  parsedJson: { document_id: DOC, ...json },
});

const transactions: TransactionWithEvents[] = [
  {
    digest: 'tx-create',
    timestampMs: '1000',
    events: [event('wal_sign::DocumentCreated', '0xalice', { title: 'Lease', authorized_signers: ['0xbob', '0xcarol'] })],
  },
  {
    digest: 'tx-rules',
    timestampMs: '1100',
    events: [
      event('wal_sign::SigningOrderSet', '0xalice', { sequential: true }),
      event('wal_sign::DeadlineSet', '0xalice', { deadline_ms: '1700000000000' }),
    ],
  },
  {
    digest: 'tx-unrelated',
    timestampMs: '1150',
    events: [{ type: `${PKG}::wal_sign::DocumentSigned`, sender: '0xzed', parsedJson: { document_id: '0xother' } }],
  },
  {
    digest: 'tx-decline',
    timestampMs: '1200',
    events: [event('wal_sign::DocumentDeclined', '0xbob', { signer: '0xbob', reason: 'Wrong rent' })],
  },
  {
    digest: 'tx-reassign',
    timestampMs: '1300',
    events: [event('wal_sign::SignerReassigned', '0xalice', { from: '0xbob', to: '0xdave' })],
  },
  {
    digest: 'tx-sign-1',
    timestampMs: '1400',
    events: [event('wal_sign::DocumentSigned', '0xdave', { signer: '0xdave', total_signatures: '1' })],
  },
  {
    digest: 'tx-thread',
    timestampMs: '1450',
    events: [event('discussion::ThreadCreated', '0xcarol', {}), { type: '0x2::coin::Other', sender: '0xcarol', parsedJson: {} }],
  },
  {
    digest: 'tx-sign-2',
    timestampMs: '1500',
    events: [
      event('wal_sign::DocumentSigned', '0xcarol', { signer: '0xcarol', total_signatures: '2' }),
      event('wal_sign::DocumentCompleted', '0xcarol', { timestamp: '1500' }),
    ],
  },
];

describe('parseAuditTrail', () => {
  it('builds a chronological trail of this document only', () => {
    const trail = parseAuditTrail([...transactions].reverse(), DOC);

    expect(trail.map((e) => e.kind)).toEqual([
      'created',
      'order-set',
      'deadline-set',
      'declined',
      'reassigned',
      'signed',
      'discussion-opened',
      'signed',
      'completed',
    ]);
    expect(trail.every((e) => e.digest !== 'tx-unrelated')).toBe(true);
  });

  it('keeps actors, subjects, digests and details', () => {
    const trail = parseAuditTrail(transactions, DOC);
    const byKind = (kind: string) => trail.filter((e) => e.kind === kind);

    expect(byKind('created')[0]).toMatchObject({ actor: '0xalice', detail: 'Lease · 2 signer(s)', timestampMs: 1000 });
    expect(byKind('declined')[0]).toMatchObject({ subject: '0xbob', detail: 'Wrong rent', digest: 'tx-decline' });
    expect(byKind('reassigned')[0]).toMatchObject({ subject: '0xdave', detail: 'Replaced 0xbob' });
    expect(byKind('deadline-set')[0].deadlineMs).toBe(1700000000000);
    expect(byKind('signed').map((e) => [e.subject, e.digest])).toEqual([
      ['0xdave', 'tx-sign-1'],
      ['0xcarol', 'tx-sign-2'],
    ]);
  });

  it('recognises a cleared deadline in both Option encodings', () => {
    const cleared = (deadline_ms: unknown) =>
      parseAuditTrail(
        [{ digest: 'd', timestampMs: '1', events: [event('wal_sign::DeadlineSet', '0xa', { deadline_ms })] }],
        DOC,
      )[0].kind;
    expect(cleared(null)).toBe('deadline-cleared');
    expect(cleared({ vec: [] })).toBe('deadline-cleared');
    expect(cleared({ vec: ['5'] })).toBe('deadline-set');
  });

  it('copes with transactions without events', () => {
    expect(parseAuditTrail([{ digest: 'x', events: null }], DOC)).toEqual([]);
  });
});

describe('getAuditTrail', () => {
  it('pages through every transaction that touched the document', async () => {
    const queryTransactionBlocks = vi
      .fn()
      .mockResolvedValueOnce({ data: transactions.slice(0, 4), hasNextPage: true, nextCursor: 'c1' })
      .mockResolvedValueOnce({ data: transactions.slice(4), hasNextPage: false, nextCursor: null });
    const client = { queryTransactionBlocks } as unknown as SuiClient;

    const trail = await getAuditTrail(client, DOC);

    expect(trail).toHaveLength(9);
    expect(queryTransactionBlocks.mock.calls[0][0]).toMatchObject({
      filter: { ChangedObject: DOC },
      options: { showEvents: true },
      order: 'ascending',
    });
    expect(queryTransactionBlocks.mock.calls[1][0].cursor).toBe('c1');
  });
});
