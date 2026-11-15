import { useCallback, useEffect, useState } from 'react';
import { suiClient } from '../config/seal.config';
import { DEFAULT_WORKFLOW, DocumentWorkflow, getDocumentWorkflow } from '../services/workflowService';

/** Loads the signing rules (order, deadline, declines) of a document */
export function useDocumentWorkflow(documentId: string | null | undefined) {
  const [workflow, setWorkflow] = useState<DocumentWorkflow>(DEFAULT_WORKFLOW);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!documentId) return;
    setIsLoading(true);
    setError(null);
    try {
      setWorkflow(await getDocumentWorkflow(suiClient, documentId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load signing rules');
    } finally {
      setIsLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    setWorkflow(DEFAULT_WORKFLOW);
    reload();
  }, [reload]);

  return { workflow, isLoading, error, reload };
}
