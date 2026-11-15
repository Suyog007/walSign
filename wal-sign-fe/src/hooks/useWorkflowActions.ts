import { useCallback, useState } from 'react';
import { useCurrentAccount, useSignAndExecuteTransactionBlock } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { suiClient } from '../config/seal.config';
import { DocumentSummary } from '../services/registryService';
import {
  addWorkflowCalls,
  buildDeclineTx,
  buildReassignTx,
  findSignerCap,
  validateDeclineReason,
  validateReassignTarget,
  WorkflowSettings,
} from '../services/workflowService';

export type WorkflowAction = 'decline' | 'reassign' | 'settings';

/**
 * Wallet actions on a document's signing workflow. Each action validates its
 * input, executes one transaction, calls `onChanged` and returns whether it succeeded.
 */
export function useWorkflowActions(document: DocumentSummary | null, onChanged?: () => void) {
  const currentAccount = useCurrentAccount();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransactionBlock();
  const [pending, setPending] = useState<WorkflowAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (action: WorkflowAction, build: () => Promise<Transaction> | Transaction): Promise<boolean> => {
      if (!document || !currentAccount) {
        setError('Wallet not connected');
        return false;
      }
      setPending(action);
      setError(null);
      try {
        const tx = await build();
        await signAndExecute({ transactionBlock: tx as any, options: { showEffects: true } });
        onChanged?.();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Transaction failed');
        return false;
      } finally {
        setPending(null);
      }
    },
    [document, currentAccount, signAndExecute, onChanged],
  );

  const decline = useCallback(
    (reason: string) => {
      const invalid = validateDeclineReason(reason);
      if (invalid) {
        setError(invalid);
        return Promise.resolve(false);
      }
      return run('decline', async () => {
        const capId = await findSignerCap(suiClient, currentAccount!.address, document!.documentId);
        if (!capId) throw new Error('You do not hold a signing capability for this document');
        return buildDeclineTx(document!.documentId, capId, reason);
      });
    },
    [run, currentAccount, document],
  );

  const reassign = useCallback(
    (from: string, to: string) => {
      const invalid = document ? validateReassignTarget(document, to) : null;
      if (invalid) {
        setError(invalid);
        return Promise.resolve(false);
      }
      return run('reassign', () => buildReassignTx(document!.documentId, from, to));
    },
    [run, document],
  );

  const saveSettings = useCallback(
    (settings: WorkflowSettings) => {
      if (settings.sequential === undefined && settings.deadlineMs === undefined) {
        return Promise.resolve(true);
      }
      return run('settings', () => addWorkflowCalls(new Transaction(), document!.documentId, settings));
    },
    [run, document],
  );

  return { decline, reassign, saveSettings, pending, error, clearError: () => setError(null) };
}
