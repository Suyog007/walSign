import { SuiClient } from '@mysten/sui/client';

export type AuditEventKind =
  | 'created'
  | 'signed'
  | 'declined'
  | 'reassigned'
  | 'order-set'
  | 'deadline-set'
  | 'deadline-cleared'
  | 'completed'
  | 'discussion-opened';

export interface AuditEntry {
  kind: AuditEventKind;
  /** Transaction that emitted the event */
  digest: string;
  /** Position of the event inside its transaction */
  eventSeq: number;
  /** Chain timestamp of the transaction (ms) */
  timestampMs: number;
  /** Address that sent the transaction */
  actor: string;
  /** Signer, reassignment target or other subject of the event, when there is one */
  subject?: string;
  /** Extra details for display: decline reason, new deadline, signing order, ... */
  detail?: string;
  /** Deadline set by a `deadline-set` event (ms) */
  deadlineMs?: number;
}

/** Minimal shape of a transaction block returned with `showEvents` */
export interface TransactionWithEvents {
  digest: string;
  timestampMs?: string | null;
  events?: Array<{
    type: string;
    sender: string;
    parsedJson?: unknown;
    id?: { eventSeq: string };
  }> | null;
}

const EVENT_KINDS: Record<string, (json: any) => Partial<AuditEntry> & { kind: AuditEventKind }> = {
  '::wal_sign::DocumentCreated': (json) => ({
    kind: 'created',
    detail: `${json.title} · ${(json.authorized_signers ?? []).length} signer(s)`,
  }),
  '::wal_sign::DocumentSigned': (json) => ({
    kind: 'signed',
    subject: json.signer,
    detail: `Signature ${json.total_signatures}`,
  }),
  '::wal_sign::DocumentDeclined': (json) => ({ kind: 'declined', subject: json.signer, detail: json.reason }),
  '::wal_sign::SignerReassigned': (json) => ({
    kind: 'reassigned',
    subject: json.to,
    detail: `Replaced ${json.from}`,
  }),
  '::wal_sign::SigningOrderSet': (json) => ({
    kind: 'order-set',
    detail: json.sequential ? 'Sequential signing' : 'Any order',
  }),
  '::wal_sign::DeadlineSet': (json) => {
    const deadline = parseOption(json.deadline_ms);
    return deadline === null
      ? { kind: 'deadline-cleared' }
      : { kind: 'deadline-set', deadlineMs: deadline, detail: new Date(deadline).toISOString() };
  },
  '::wal_sign::DocumentCompleted': () => ({ kind: 'completed' }),
  '::discussion::ThreadCreated': () => ({ kind: 'discussion-opened' }),
};

function parseOption(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && 'vec' in (value as any)) {
    const vec = (value as any).vec as unknown[];
    return vec.length ? Number(vec[0]) : null;
  }
  return Number(value);
}

/**
 * Turn transactions into an ordered audit trail for one document.
 * Only walSign events that reference `documentId` are kept.
 */
export function parseAuditTrail(transactions: TransactionWithEvents[], documentId: string): AuditEntry[] {
  const entries: AuditEntry[] = [];
  for (const tx of transactions) {
    (tx.events ?? []).forEach((event, index) => {
      const json = event.parsedJson as any;
      if (!json || json.document_id !== documentId) return;
      const suffix = Object.keys(EVENT_KINDS).find((key) => event.type.endsWith(key));
      if (!suffix) return;
      entries.push({
        digest: tx.digest,
        eventSeq: event.id ? Number(event.id.eventSeq) : index,
        timestampMs: Number(tx.timestampMs ?? 0),
        actor: event.sender,
        ...EVENT_KINDS[suffix](json),
      });
    });
  }
  // Stable chronological order; events of one transaction keep their emission order
  return entries.sort((a, b) => a.timestampMs - b.timestampMs);
}

/** Load every transaction that created or changed the document and build its audit trail */
export async function getAuditTrail(suiClient: SuiClient, documentId: string): Promise<AuditEntry[]> {
  const transactions: TransactionWithEvents[] = [];
  let cursor: string | null | undefined = null;
  do {
    const page = await suiClient.queryTransactionBlocks({
      filter: { ChangedObject: documentId },
      options: { showEvents: true },
      order: 'ascending',
      cursor,
      limit: 50,
    });
    transactions.push(...(page.data as TransactionWithEvents[]));
    cursor = page.hasNextPage ? page.nextCursor : null;
  } while (cursor);

  return parseAuditTrail(transactions, documentId);
}
