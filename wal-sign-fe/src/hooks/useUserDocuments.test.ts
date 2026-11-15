import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentSummary } from '../services/registryService';

const mocks = vi.hoisted(() => ({
  account: null as { address: string } | null,
  getUserCreatedDocuments: vi.fn(),
  getUserAssignedDocuments: vi.fn(),
  getMultipleDocuments: vi.fn(),
}));

vi.mock('@mysten/dapp-kit', () => ({ useCurrentAccount: () => mocks.account }));
vi.mock('../services/registryService', () => ({
  getUserCreatedDocuments: mocks.getUserCreatedDocuments,
  getUserAssignedDocuments: mocks.getUserAssignedDocuments,
  getMultipleDocuments: mocks.getMultipleDocuments,
}));

import { useUserDocuments } from './useUserDocuments';

const doc = (id: string) => ({ documentId: id, title: id }) as DocumentSummary;

beforeEach(() => {
  mocks.account = { address: '0xalice' };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('useUserDocuments', () => {
  it('loads created and assigned documents, without duplicates', async () => {
    mocks.getUserCreatedDocuments.mockResolvedValue(['0x1', '0x1', '0x2']);
    mocks.getUserAssignedDocuments.mockResolvedValue(['0x3']);
    mocks.getMultipleDocuments.mockImplementation(async (_client: unknown, ids: string[]) =>
      ids.flatMap((id) => (id === '0x2' ? [doc(id), doc(id)] : [doc(id)])),
    );

    const { result } = renderHook(() => useUserDocuments());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mocks.getMultipleDocuments.mock.calls[0][1]).toEqual(['0x1', '0x2']);
    expect(result.current.createdDocs.map((d) => d.documentId)).toEqual(['0x1', '0x2']);
    expect(result.current.assignedDocs.map((d) => d.documentId)).toEqual(['0x3']);
    expect(result.current.error).toBeNull();
  });

  it('is empty and idle when no wallet is connected', async () => {
    mocks.account = null;
    const { result } = renderHook(() => useUserDocuments());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.createdDocs).toEqual([]);
    expect(mocks.getUserCreatedDocuments).not.toHaveBeenCalled();
  });

  it('reports a load failure', async () => {
    mocks.getUserCreatedDocuments.mockRejectedValue(new Error('rpc down'));
    mocks.getUserAssignedDocuments.mockResolvedValue([]);

    const { result } = renderHook(() => useUserDocuments());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe('Failed to load documents');
  });

  it('picks up new documents on refresh', async () => {
    mocks.getUserCreatedDocuments.mockResolvedValue([]);
    mocks.getUserAssignedDocuments.mockResolvedValue([]);
    mocks.getMultipleDocuments.mockResolvedValue([]);
    const { result } = renderHook(() => useUserDocuments());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mocks.getUserCreatedDocuments.mockResolvedValue(['0x9']);
    mocks.getMultipleDocuments.mockImplementation(async (_c: unknown, ids: string[]) => ids.map(doc));
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.createdDocs.map((d) => d.documentId)).toEqual(['0x9']);
  });
});
