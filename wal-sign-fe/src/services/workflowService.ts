import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { isValidSuiAddress } from '@mysten/sui/utils';
import { PACKAGE_ID, REGISTRY_OBJECT_ID } from '../config/seal.config';
import { DocumentSummary } from './registryService';
import { getDynamicFieldValue } from './dynamicFields';

const CLOCK_OBJECT_ID = '0x6';

/** Must match MAX_REASON_BYTES in the wal_sign Move module */
export const MAX_DECLINE_REASON_BYTES = 500;

export interface DeclineRecord {
  signer: string;
  reason: string;
  declinedAt: number;
}

/** Signing rules of a document (defaults apply when the creator never set any) */
export interface DocumentWorkflow {
  sequential: boolean;
  deadlineMs: number | null;
  declines: DeclineRecord[];
}

export const DEFAULT_WORKFLOW: DocumentWorkflow = { sequential: false, deadlineMs: null, declines: [] };

export type SignerState = 'signed' | 'declined' | 'up-next' | 'waiting' | 'pending';

export interface SignerStep {
  address: string;
  /** 1-based position in the signing order */
  position: number;
  state: SignerState;
  signedAt?: number;
  decline?: DeclineRecord;
}

export type DocumentPhase = 'completed' | 'declined' | 'expired' | 'in-progress';

export interface WorkflowSettings {
  sequential?: boolean;
  /** A timestamp sets the deadline, `null` clears it, `undefined` leaves it unchanged */
  deadlineMs?: number | null;
}

// ======== Reading ========

/** Load a document's workflow settings from its `WorkflowKey` dynamic field */
export async function getDocumentWorkflow(suiClient: SuiClient, documentId: string): Promise<DocumentWorkflow> {
  const value = await getDynamicFieldValue(suiClient, documentId, '::wal_sign::WorkflowKey');
  if (!value) return DEFAULT_WORKFLOW;

  const fields = value.fields ?? value;
  return {
    sequential: Boolean(fields.sequential),
    deadlineMs: parseOptionalU64(fields.deadline_ms),
    declines: (fields.declines ?? []).map((entry: any) => {
      const decline = entry.fields ?? entry;
      return {
        signer: decline.signer,
        reason: decline.reason,
        declinedAt: Number(decline.declined_at),
      };
    }),
  };
}

/** Option<u64> is rendered either as the value/null or as `{ vec: [...] }` depending on the RPC */
function parseOptionalU64(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && 'vec' in (value as any)) {
    const vec = (value as any).vec as unknown[];
    return vec.length ? Number(vec[0]) : null;
  }
  return Number(value);
}

// ======== Derived state ========

/** Per-signer progress in signing order */
export function getSignerSteps(document: DocumentSummary, workflow: DocumentWorkflow): SignerStep[] {
  let nextAssigned = false;
  return document.authorizedSigners.map((address, i) => {
    const signature = document.signatures.find((s) => s.signer === address);
    const decline = workflow.declines.find((d) => d.signer === address);
    let state: SignerState;
    if (signature) {
      state = 'signed';
    } else if (decline) {
      state = 'declined';
    } else if (!workflow.sequential) {
      state = 'pending';
    } else if (!nextAssigned) {
      state = 'up-next';
    } else {
      state = 'waiting';
    }
    if (!signature && workflow.sequential) nextAssigned = true;
    return { address, position: i + 1, state, signedAt: signature?.signedAt, decline };
  });
}

/** Overall phase of the document at time `now` */
export function getDocumentPhase(document: DocumentSummary, workflow: DocumentWorkflow, now: number): DocumentPhase {
  if (document.status === 2) return 'completed';
  if (document.status === 3 || workflow.declines.length > 0) return 'declined';
  if (workflow.deadlineMs !== null && now > workflow.deadlineMs) return 'expired';
  return 'in-progress';
}

/**
 * Why `address` cannot sign right now, mirroring the checks in `sign_document`;
 * null when signing is allowed.
 */
export function getSigningBlocker(
  document: DocumentSummary,
  workflow: DocumentWorkflow,
  address: string,
  now: number,
): string | null {
  if (!document.authorizedSigners.includes(address)) return 'You are not a signer of this document.';
  if (document.signatures.some((s) => s.signer === address)) return 'You have already signed this document.';
  if (workflow.declines.length > 0) {
    return workflow.declines.some((d) => d.signer === address)
      ? 'You declined this document. The creator can reassign your place to someone else.'
      : 'A signer declined this document. Signing is paused until the creator reassigns them.';
  }
  if (workflow.deadlineMs !== null && now > workflow.deadlineMs) return 'The signing deadline has passed.';
  if (workflow.sequential) {
    const next = getSignerSteps(document, workflow).find((step) => step.state === 'up-next');
    if (next && next.address !== address) return `Waiting for signer #${next.position} to sign first.`;
  }
  return null;
}

/** Human readable distance to a deadline, e.g. "Due in 3 days" or "Overdue by 2 hours" */
export function describeDeadline(deadlineMs: number, now: number): string {
  const diff = deadlineMs - now;
  const abs = Math.abs(diff);
  const units: Array<[string, number]> = [
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
  ];
  const [unit, size] = units.find(([, ms]) => abs >= ms) ?? ['minute', 60_000];
  const count = Math.max(1, Math.floor(abs / size));
  const span = `${count} ${unit}${count === 1 ? '' : 's'}`;
  return diff >= 0 ? `Due in ${span}` : `Overdue by ${span}`;
}

// ======== Validation ========

/** Parse a `datetime-local` input value into a future timestamp */
export function parseDeadlineInput(value: string, now: number): { deadlineMs: number } | { error: string } {
  if (!value) return { error: 'Choose a date and time' };
  const deadlineMs = new Date(value).getTime();
  if (Number.isNaN(deadlineMs)) return { error: 'Invalid date' };
  if (deadlineMs <= now) return { error: 'The deadline must be in the future' };
  return { deadlineMs };
}

export function validateDeclineReason(reason: string): string | null {
  const trimmed = reason.trim();
  if (!trimmed) return 'Please tell the creator why you are declining';
  if (new TextEncoder().encode(trimmed).length > MAX_DECLINE_REASON_BYTES) {
    return `Reason is too long (max ${MAX_DECLINE_REASON_BYTES} bytes)`;
  }
  return null;
}

export function validateReassignTarget(document: DocumentSummary, address: string): string | null {
  const normalized = address.trim();
  if (!isValidSuiAddress(normalized)) return 'Enter a valid Sui address';
  if (document.authorizedSigners.includes(normalized)) return 'This address is already a signer';
  return null;
}

// ======== Transactions ========

/** Append the calls that apply `settings` to `tx` (so they can share a transaction with other steps) */
export function addWorkflowCalls(tx: Transaction, documentId: string, settings: WorkflowSettings): Transaction {
  if (settings.sequential !== undefined) {
    tx.moveCall({
      target: `${PACKAGE_ID}::wal_sign::set_signing_order`,
      arguments: [tx.object(documentId), tx.pure.bool(settings.sequential)],
    });
  }
  if (settings.deadlineMs === null) {
    tx.moveCall({
      target: `${PACKAGE_ID}::wal_sign::clear_deadline`,
      arguments: [tx.object(documentId)],
    });
  } else if (settings.deadlineMs !== undefined) {
    tx.moveCall({
      target: `${PACKAGE_ID}::wal_sign::set_deadline`,
      arguments: [tx.object(documentId), tx.pure.u64(settings.deadlineMs), tx.object(CLOCK_OBJECT_ID)],
    });
  }
  return tx;
}

export function buildDeclineTx(documentId: string, signerCapId: string, reason: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::wal_sign::decline_document`,
    arguments: [
      tx.object(documentId),
      tx.object(signerCapId),
      tx.pure.string(reason.trim()),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });
  return tx;
}

export function buildReassignTx(documentId: string, from: string, to: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::wal_sign::reassign_signer`,
    arguments: [
      tx.object(REGISTRY_OBJECT_ID),
      tx.object(documentId),
      tx.pure.address(from),
      tx.pure.address(to.trim()),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });
  return tx;
}

/** Find the SignerCap `owner` holds for `documentId`, paging through their objects */
export async function findSignerCap(suiClient: SuiClient, owner: string, documentId: string): Promise<string | null> {
  let cursor: string | null | undefined = null;
  do {
    const page = await suiClient.getOwnedObjects({
      owner,
      cursor,
      limit: 50,
      filter: { StructType: `${PACKAGE_ID}::wal_sign::SignerCap` },
      options: { showContent: true },
    });
    for (const object of page.data) {
      const content = object.data?.content;
      if (content && 'fields' in content && (content.fields as any).document_id === documentId) {
        return object.data!.objectId;
      }
    }
    cursor = page.hasNextPage ? page.nextCursor : null;
  } while (cursor);
  return null;
}
