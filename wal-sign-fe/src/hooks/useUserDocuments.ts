import { useState, useEffect } from 'react';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { suiClient } from '../config/seal.config';
import {
  getUserCreatedDocuments,
  getUserAssignedDocuments,
  getMultipleDocuments,
  DocumentSummary,
} from '../services/registryService';

export function useUserDocuments() {
  const currentAccount = useCurrentAccount();
  const [createdDocs, setCreatedDocs] = useState<DocumentSummary[]>([]);
  const [assignedDocs, setAssignedDocs] = useState<DocumentSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDocuments() {
      if (!currentAccount?.address) {
        setCreatedDocs([]);
        setAssignedDocs([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        // Fetch document IDs
        const [createdIds, assignedIds] = await Promise.all([
          getUserCreatedDocuments(suiClient, currentAccount.address),
          getUserAssignedDocuments(suiClient, currentAccount.address),
        ]);

        // Deduplicate document IDs
        const uniqueCreatedIds = [...new Set(createdIds)];
        const uniqueAssignedIds = [...new Set(assignedIds)];

        // Fetch full document details
        const [createdDocuments, assignedDocuments] = await Promise.all([
          getMultipleDocuments(suiClient, uniqueCreatedIds),
          getMultipleDocuments(suiClient, uniqueAssignedIds),
        ]);

        // Deduplicate documents by ID (in case same doc appears in both lists)
        const deduplicatedCreated = Array.from(
          new Map(createdDocuments.map(doc => [doc.documentId, doc])).values()
        );
        const deduplicatedAssigned = Array.from(
          new Map(assignedDocuments.map(doc => [doc.documentId, doc])).values()
        );

        setCreatedDocs(deduplicatedCreated);
        setAssignedDocs(deduplicatedAssigned);
      } catch (err) {
        console.error('Error fetching user documents:', err);
        setError('Failed to load documents');
      } finally {
        setIsLoading(false);
      }
    }

    fetchDocuments();
  }, [currentAccount?.address]);

  const refresh = async () => {
    if (currentAccount?.address) {
      setIsLoading(true);
      try {
        const [createdIds, assignedIds] = await Promise.all([
          getUserCreatedDocuments(suiClient, currentAccount.address),
          getUserAssignedDocuments(suiClient, currentAccount.address),
        ]);

        // Deduplicate document IDs
        const uniqueCreatedIds = [...new Set(createdIds)];
        const uniqueAssignedIds = [...new Set(assignedIds)];

        const [createdDocuments, assignedDocuments] = await Promise.all([
          getMultipleDocuments(suiClient, uniqueCreatedIds),
          getMultipleDocuments(suiClient, uniqueAssignedIds),
        ]);

        // Deduplicate documents by ID
        const deduplicatedCreated = Array.from(
          new Map(createdDocuments.map(doc => [doc.documentId, doc])).values()
        );
        const deduplicatedAssigned = Array.from(
          new Map(assignedDocuments.map(doc => [doc.documentId, doc])).values()
        );

        setCreatedDocs(deduplicatedCreated);
        setAssignedDocs(deduplicatedAssigned);
      } catch (err) {
        setError('Failed to refresh documents');
      } finally {
        setIsLoading(false);
      }
    }
  };

  return {
    createdDocs,
    assignedDocs,
    isLoading,
    error,
    refresh,
  };
}



