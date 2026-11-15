import { Transaction } from '@mysten/sui/transactions';
import { PACKAGE_ID, REGISTRY_OBJECT_ID } from '../config/seal.config';
import { formatAddress } from '../utils/addressUtils';
import { addWorkflowCalls, WorkflowSettings } from './workflowService';

const CLOCK_OBJECT_ID = '0x6';

/** Upper bound of documents per send, keeps both transactions well inside PTB limits */
export const MAX_DOCUMENTS_PER_SEND = 50;

export interface PlannedDocument {
  title: string;
  /** Signers in role order */
  signers: string[];
}

/** One document per recipient row; titles carry the first recipient when several documents are sent */
export function planDocuments(baseTitle: string, rows: string[][]): PlannedDocument[] {
  const title = baseTitle.trim();
  return rows.map((signers) => ({
    title: rows.length === 1 ? title : `${title} - ${formatAddress(signers[0])}`,
    signers,
  }));
}

/** A single transaction that creates every planned document (blob IDs are recorded later) */
export function buildCreateDocumentsTx(documents: PlannedDocument[]): Transaction {
  if (documents.length === 0) throw new Error('Add at least one recipient');
  if (documents.length > MAX_DOCUMENTS_PER_SEND) {
    throw new Error(`Send at most ${MAX_DOCUMENTS_PER_SEND} documents at a time`);
  }
  const tx = new Transaction();
  for (const document of documents) {
    tx.moveCall({
      target: `${PACKAGE_ID}::wal_sign::create_document`,
      arguments: [
        tx.object(REGISTRY_OBJECT_ID),
        tx.pure.string(''),
        tx.pure.string(document.title),
        tx.pure.string(''),
        tx.pure.vector('address', document.signers),
        tx.object(CLOCK_OBJECT_ID),
      ],
    });
  }
  return tx;
}

/**
 * Document IDs created by `buildCreateDocumentsTx`, in the order they were planned.
 * DocumentCreated events are emitted in call order, unlike object changes.
 */
export function extractCreatedDocumentIds(result: { events?: Array<{ type: string; parsedJson?: unknown }> | null }): string[] {
  return (result.events ?? [])
    .filter((event) => event.type.endsWith('::wal_sign::DocumentCreated'))
    .map((event) => (event.parsedJson as { document_id: string }).document_id);
}

/** A single transaction that records every uploaded blob and applies the signing rules */
export function buildFinalizeDocumentsTx(
  uploads: Array<{ documentId: string; walrusBlobId: string }>,
  workflow: WorkflowSettings,
): Transaction {
  const tx = new Transaction();
  for (const { documentId, walrusBlobId } of uploads) {
    tx.moveCall({
      target: `${PACKAGE_ID}::wal_sign::update_blob_id`,
      arguments: [tx.object(documentId), tx.pure.string(walrusBlobId)],
    });
    addWorkflowCalls(tx, documentId, workflow);
  }
  return tx;
}
