import { useCallback, useEffect, useState } from 'react';
import {
  useCurrentAccount,
  useSignAndExecuteTransactionBlock,
  useSignPersonalMessage,
} from '@mysten/dapp-kit';
import { SessionKey } from '@mysten/seal';
import { PACKAGE_ID, suiClient } from '../config/seal.config';
import { encryptPDF } from '../services/documentService';
import { downloadFromWalrus, uploadToWalrus } from '../services/walrusService';
import {
  buildCreateTemplateTx,
  buildDeleteTemplateTx,
  buildSetTemplateBlobTx,
  decryptTemplatePdf,
  DocumentTemplate,
  listTemplates,
  TemplateDraft,
  validateTemplateDraft,
} from '../services/templateService';

const errorMessage = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

/** The connected user's templates: list, create, delete and open (decrypt) them */
export function useTemplates() {
  const currentAccount = useCurrentAccount();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransactionBlock();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();
  const address = currentAccount?.address;

  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!address) {
      setTemplates([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      setTemplates(await listTemplates(suiClient, address));
    } catch (err) {
      setError(errorMessage(err, 'Failed to load templates'));
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  useEffect(() => {
    reload();
  }, [reload]);

  /** Creates the template, then encrypts and uploads its PDF. Returns the template ID. */
  const create = useCallback(
    async (draft: TemplateDraft, pdf: File): Promise<string | null> => {
      const invalid = validateTemplateDraft(draft);
      if (invalid) {
        setError(invalid);
        return null;
      }
      setIsSaving(true);
      setError(null);
      try {
        const created: any = await signAndExecute({
          transactionBlock: buildCreateTemplateTx(draft) as any,
          options: { showObjectChanges: true },
        });
        const object = created.objectChanges?.find(
          (change: any) => change.type === 'created' && change.objectType?.endsWith('::template::Template'),
        );
        if (!object) throw new Error('The template was not created');
        const templateId: string = object.objectId;

        const { encryptedData } = await encryptPDF(PACKAGE_ID, templateId, pdf);
        const blobId = await uploadToWalrus(encryptedData);
        await signAndExecute({ transactionBlock: buildSetTemplateBlobTx(templateId, blobId) as any });

        await reload();
        return templateId;
      } catch (err) {
        setError(errorMessage(err, 'Failed to save the template'));
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    [signAndExecute, reload],
  );

  const remove = useCallback(
    async (templateId: string) => {
      setIsSaving(true);
      setError(null);
      try {
        await signAndExecute({ transactionBlock: buildDeleteTemplateTx(templateId) as any });
        setTemplates((prev) => prev.filter((t) => t.templateId !== templateId));
        return true;
      } catch (err) {
        setError(errorMessage(err, 'Failed to delete the template'));
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [signAndExecute],
  );

  /** Downloads and decrypts the template PDF (asks the wallet to sign a session message) */
  const openPdf = useCallback(
    async (template: DocumentTemplate): Promise<Uint8Array | null> => {
      if (!address) {
        setError('Wallet not connected');
        return null;
      }
      if (!template.walrusBlobId) {
        setError('This template has no PDF yet');
        return null;
      }
      setError(null);
      try {
        const encrypted = await downloadFromWalrus(template.walrusBlobId);
        const sessionKey = await SessionKey.create({ address, packageId: PACKAGE_ID, ttlMin: 10, suiClient });
        const { signature } = await signPersonalMessage({ message: sessionKey.getPersonalMessage() });
        await sessionKey.setPersonalMessageSignature(signature);
        return await decryptTemplatePdf(suiClient, template.templateId, encrypted, sessionKey);
      } catch (err) {
        setError(errorMessage(err, 'Failed to open the template'));
        return null;
      }
    },
    [address, signPersonalMessage],
  );

  return { templates, isLoading, isSaving, error, reload, create, remove, openPdf };
}
