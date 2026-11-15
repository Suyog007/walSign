/** walSign events the notifier reacts to */
export type WalSignEvent =
  | { kind: 'created'; documentId: string; creator: string; title: string; signers: string[] }
  | { kind: 'signed'; documentId: string; signer: string }
  | { kind: 'order-set'; documentId: string; sequential: boolean }
  | { kind: 'deadline-set'; documentId: string; deadlineMs: number | null }
  | { kind: 'reassigned'; documentId: string; from: string; to: string }
  | { kind: 'completed'; documentId: string };

/** A raw event as returned by suix_queryEvents */
export interface RawEvent {
  id: { txDigest: string; eventSeq: string };
  type: string;
  parsedJson?: unknown;
}

function parseOption(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && 'vec' in (value as Record<string, unknown>)) {
    const vec = (value as { vec: unknown[] }).vec;
    return vec.length ? Number(vec[0]) : null;
  }
  return Number(value);
}

/** Map a raw event to a WalSignEvent; returns null for events the notifier ignores */
export function parseEvent(raw: RawEvent): WalSignEvent | null {
  const json = (raw.parsedJson ?? {}) as Record<string, any>;
  const name = raw.type.split('::').pop();
  const documentId = json.document_id as string;
  switch (name) {
    case 'DocumentCreated':
      return {
        kind: 'created',
        documentId,
        creator: json.creator,
        title: json.title,
        signers: json.authorized_signers ?? [],
      };
    case 'DocumentSigned':
      return { kind: 'signed', documentId, signer: json.signer };
    case 'SigningOrderSet':
      return { kind: 'order-set', documentId, sequential: Boolean(json.sequential) };
    case 'DeadlineSet':
      return { kind: 'deadline-set', documentId, deadlineMs: parseOption(json.deadline_ms) };
    case 'SignerReassigned':
      return { kind: 'reassigned', documentId, from: json.from, to: json.to };
    case 'DocumentCompleted':
      return { kind: 'completed', documentId };
    default:
      return null;
  }
}
