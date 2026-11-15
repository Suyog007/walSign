import { useCallback, useEffect, useState } from 'react';
import { suiClient } from '../config/seal.config';
import { AuditEntry, getAuditTrail } from '../services/auditService';

/** Loads the on-chain audit trail of a document */
export function useAuditTrail(documentId: string | null | undefined) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!documentId) return;
    setIsLoading(true);
    setError(null);
    try {
      setEntries(await getAuditTrail(suiClient, documentId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the audit trail');
    } finally {
      setIsLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    setEntries([]);
    reload();
  }, [reload]);

  return { entries, isLoading, error, reload };
}
