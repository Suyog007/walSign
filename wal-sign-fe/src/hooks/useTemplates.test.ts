import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentTemplate, TemplateDraft } from '../services/templateService';

const mocks = vi.hoisted(() => ({
  account: { address: '0xalice' } as { address: string } | null,
  signAndExecute: vi.fn(),
  signPersonalMessage: vi.fn(),
  createSessionKey: vi.fn(),
  listTemplates: vi.fn(),
  decryptTemplatePdf: vi.fn(),
  encryptPDF: vi.fn(),
  uploadToWalrus: vi.fn(),
  downloadFromWalrus: vi.fn(),
}));

vi.mock('@mysten/dapp-kit', () => ({
  useCurrentAccount: () => mocks.account,
  useSignAndExecuteTransactionBlock: () => ({ mutateAsync: mocks.signAndExecute }),
  useSignPersonalMessage: () => ({ mutateAsync: mocks.signPersonalMessage }),
}));
vi.mock('@mysten/seal', () => ({ SessionKey: { create: mocks.createSessionKey } }));
vi.mock('../services/documentService', () => ({ encryptPDF: mocks.encryptPDF }));
vi.mock('../services/walrusService', () => ({
  uploadToWalrus: mocks.uploadToWalrus,
  downloadFromWalrus: mocks.downloadFromWalrus,
}));
vi.mock('../services/templateService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/templateService')>()),
  listTemplates: mocks.listTemplates,
  decryptTemplatePdf: mocks.decryptTemplatePdf,
  buildCreateTemplateTx: (draft: TemplateDraft) => ({ kind: 'create', name: draft.name }),
  buildSetTemplateBlobTx: (id: string, blob: string) => ({ kind: 'blob', id, blob }),
  buildDeleteTemplateTx: (id: string) => ({ kind: 'delete', id }),
}));

import { useTemplates } from './useTemplates';

const template = { templateId: '0xt1', name: 'Lease', walrusBlobId: 'blob-t' } as DocumentTemplate;
const draft: TemplateDraft = { name: 'Lease', description: '', roles: ['Tenant'], fields: [], sequential: false };
const pdf = new File(['%PDF'], 'lease.pdf', { type: 'application/pdf' });

beforeEach(() => {
  mocks.account = { address: '0xalice' };
  mocks.listTemplates.mockResolvedValue([template]);
});

async function renderLoaded() {
  const hook = renderHook(() => useTemplates());
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  return hook;
}

describe('useTemplates', () => {
  it('lists the connected user’s templates', async () => {
    const { result } = await renderLoaded();
    expect(result.current.templates).toEqual([template]);
    expect(mocks.listTemplates).toHaveBeenCalledWith(expect.anything(), '0xalice');
  });

  it('is empty without a wallet', async () => {
    mocks.account = null;
    const { result } = await renderLoaded();
    expect(result.current.templates).toEqual([]);
    expect(mocks.listTemplates).not.toHaveBeenCalled();
  });

  it('creates a template, encrypts the PDF under its id and records the blob', async () => {
    mocks.signAndExecute
      .mockResolvedValueOnce({ objectChanges: [{ type: 'created', objectType: '0xp::template::Template', objectId: '0xnew' }] })
      .mockResolvedValueOnce({});
    mocks.encryptPDF.mockResolvedValue({ encryptedData: new Uint8Array([1]) });
    mocks.uploadToWalrus.mockResolvedValue('blob-new');
    const { result } = await renderLoaded();

    let id: string | null = null;
    await act(async () => {
      id = await result.current.create(draft, pdf);
    });

    expect(id).toBe('0xnew');
    expect(mocks.encryptPDF).toHaveBeenCalledWith('0xpackage', '0xnew', pdf);
    expect(mocks.signAndExecute.mock.calls[1][0].transactionBlock).toEqual({ kind: 'blob', id: '0xnew', blob: 'blob-new' });
    expect(mocks.listTemplates).toHaveBeenCalledTimes(2);
  });

  it('validates the draft before asking the wallet', async () => {
    const { result } = await renderLoaded();
    await act(async () => {
      await result.current.create({ ...draft, roles: [] }, pdf);
    });
    expect(result.current.error).toBe('Add at least one signer role');
    expect(mocks.signAndExecute).not.toHaveBeenCalled();
  });

  it('reports a failed upload', async () => {
    mocks.signAndExecute.mockResolvedValueOnce({
      objectChanges: [{ type: 'created', objectType: '0xp::template::Template', objectId: '0xnew' }],
    });
    mocks.encryptPDF.mockResolvedValue({ encryptedData: new Uint8Array([1]) });
    mocks.uploadToWalrus.mockRejectedValue(new Error('Walrus upload failed (500)'));
    const { result } = await renderLoaded();

    await act(async () => {
      await result.current.create(draft, pdf);
    });
    expect(result.current.error).toBe('Walrus upload failed (500)');
    expect(result.current.isSaving).toBe(false);
  });

  it('deletes a template', async () => {
    mocks.signAndExecute.mockResolvedValue({});
    const { result } = await renderLoaded();
    await act(async () => {
      await result.current.remove('0xt1');
    });
    expect(mocks.signAndExecute.mock.calls[0][0].transactionBlock).toEqual({ kind: 'delete', id: '0xt1' });
    expect(result.current.templates).toEqual([]);
  });

  it('opens a template PDF after a session signature', async () => {
    const sessionKey = { getPersonalMessage: () => new Uint8Array([1]), setPersonalMessageSignature: vi.fn() };
    mocks.createSessionKey.mockResolvedValue(sessionKey);
    mocks.signPersonalMessage.mockResolvedValue({ signature: 'sig' });
    mocks.downloadFromWalrus.mockResolvedValue(new Uint8Array([7]));
    mocks.decryptTemplatePdf.mockResolvedValue(new Uint8Array([37, 80]));
    const { result } = await renderLoaded();

    let bytes: Uint8Array | null = null;
    await act(async () => {
      bytes = await result.current.openPdf(template);
    });

    expect(bytes).toEqual(new Uint8Array([37, 80]));
    expect(mocks.downloadFromWalrus).toHaveBeenCalledWith('blob-t');
    expect(sessionKey.setPersonalMessageSignature).toHaveBeenCalledWith('sig');
    expect(mocks.decryptTemplatePdf).toHaveBeenCalledWith(expect.anything(), '0xt1', new Uint8Array([7]), sessionKey);
  });

  it('refuses to open a template without a PDF', async () => {
    const { result } = await renderLoaded();
    await act(async () => {
      await result.current.openPdf({ ...template, walrusBlobId: '' });
    });
    expect(result.current.error).toBe('This template has no PDF yet');
  });
});
