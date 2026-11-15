import { useCallback, useState } from 'react';
import { useSignAndExecuteTransactionBlock } from '@mysten/dapp-kit';
import { PACKAGE_ID } from '../config/seal.config';
import { encryptPDF } from '../services/documentService';
import { uploadToWalrus } from '../services/walrusService';
import {
  buildCreateDocumentsTx,
  buildFinalizeDocumentsTx,
  extractCreatedDocumentIds,
  planDocuments,
} from '../services/bulkSendService';
import { WorkflowSettings } from '../services/workflowService';

export type SendStage = 'idle' | 'creating' | 'uploading' | 'finalizing' | 'complete' | 'error';

export interface SendProgress {
  stage: SendStage;
  done: number;
  total: number;
}

export interface SentDocument {
  documentId: string;
  title: string;
  signers: string[];
}

export interface FailedDocument {
  title: string;
  signers: string[];
  error: string;
}

const IDLE: SendProgress = { stage: 'idle', done: 0, total: 0 };

/** Sends a (stamped) template PDF to one document per recipient row */
export function useTemplateSend() {
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransactionBlock();
  const [progress, setProgress] = useState<SendProgress>(IDLE);
  const [sent, setSent] = useState<SentDocument[]>([]);
  const [failed, setFailed] = useState<FailedDocument[]>([]);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(
    async (input: { pdf: Uint8Array; title: string; rows: string[][]; workflow: WorkflowSettings }) => {
      setError(null);
      setSent([]);
      setFailed([]);
      const planned = planDocuments(input.title, input.rows);
      const total = planned.length;
      try {
        if (!input.title.trim()) throw new Error('Give the documents a title');

        setProgress({ stage: 'creating', done: 0, total });
        const createResult: any = await signAndExecute({
          transactionBlock: buildCreateDocumentsTx(planned) as any,
          options: { showEvents: true },
        });
        const documentIds = extractCreatedDocumentIds(createResult);
        if (documentIds.length !== total) throw new Error('Not every document was created');

        // Each document is encrypted under its own ID, so every recipient gets a separate blob
        const uploads: Array<{ documentId: string; walrusBlobId: string }> = [];
        const succeeded: SentDocument[] = [];
        const failures: FailedDocument[] = [];
        for (let i = 0; i < total; i++) {
          setProgress({ stage: 'uploading', done: i, total });
          const documentId = documentIds[i];
          try {
            const file = new File([input.pdf.slice()], `${planned[i].title}.pdf`, { type: 'application/pdf' });
            const { encryptedData } = await encryptPDF(PACKAGE_ID, documentId, file);
            uploads.push({ documentId, walrusBlobId: await uploadToWalrus(encryptedData) });
            succeeded.push({ documentId, ...planned[i] });
          } catch (err) {
            failures.push({ ...planned[i], error: err instanceof Error ? err.message : 'Upload failed' });
          }
        }
        if (uploads.length === 0) throw new Error(failures[0]?.error ?? 'Every upload failed');

        setProgress({ stage: 'finalizing', done: uploads.length, total });
        await signAndExecute({ transactionBlock: buildFinalizeDocumentsTx(uploads, input.workflow) as any });

        setSent(succeeded);
        setFailed(failures);
        setProgress({ stage: 'complete', done: uploads.length, total });
        return succeeded;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Sending failed');
        setProgress((prev) => ({ ...prev, stage: 'error' }));
        return [];
      }
    },
    [signAndExecute],
  );

  const reset = useCallback(() => {
    setProgress(IDLE);
    setSent([]);
    setFailed([]);
    setError(null);
  }, []);

  return { send, reset, progress, sent, failed, error };
}
