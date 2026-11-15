import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SuiClient } from '@mysten/sui/client';
import {
  DocumentSummary,
  getDocumentDetails,
  getLatestBlobId,
  getMultipleDocuments,
  getRegistryStats,
  getUserAssignedDocuments,
  getUserCreatedDocuments,
} from './registryService';

const getObject = vi.fn();
const getDynamicFieldObject = vi.fn();
const client = { getObject, getDynamicFieldObject } as unknown as SuiClient;

function moveObject(fields: Record<string, unknown>) {
  return { data: { content: { dataType: 'moveObject', fields } } };
}

const registry = moveObject({
  created_by_user: { fields: { id: { id: '0xcreated_table' } } },
  assigned_to_user: { fields: { id: { id: '0xassigned_table' } } },
  total_documents: '4',
});

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('registry lookups', () => {
  it('reads the created documents from the per-user table entry', async () => {
    getObject.mockResolvedValue(registry);
    getDynamicFieldObject.mockResolvedValue(moveObject({ value: ['0xd1', '0xd2'] }));

    await expect(getUserCreatedDocuments(client, '0xalice')).resolves.toEqual(['0xd1', '0xd2']);
    expect(getDynamicFieldObject).toHaveBeenCalledWith({
      parentId: '0xcreated_table',
      name: { type: 'address', value: '0xalice' },
    });
  });

  it('reads the assigned documents from the assigned table', async () => {
    getObject.mockResolvedValue(registry);
    getDynamicFieldObject.mockResolvedValue(moveObject({ value: ['0xd3'] }));

    await expect(getUserAssignedDocuments(client, '0xbob')).resolves.toEqual(['0xd3']);
    expect(getDynamicFieldObject.mock.calls[0][0].parentId).toBe('0xassigned_table');
  });

  it('treats a missing table entry as "no documents"', async () => {
    getObject.mockResolvedValue(registry);
    getDynamicFieldObject.mockRejectedValue(new Error('Could not find the referenced object'));

    await expect(getUserCreatedDocuments(client, '0xnew')).resolves.toEqual([]);
    await expect(getUserAssignedDocuments(client, '0xnew')).resolves.toEqual([]);
  });

  it('returns an empty list when the registry cannot be read', async () => {
    getObject.mockResolvedValue({ data: null });
    await expect(getUserCreatedDocuments(client, '0xalice')).resolves.toEqual([]);
  });

  it('reads the total document count', async () => {
    getObject.mockResolvedValue(registry);
    await expect(getRegistryStats(client)).resolves.toEqual({ totalDocuments: 4 });
  });
});

describe('getDocumentDetails', () => {
  it('maps the on-chain fields to a DocumentSummary', async () => {
    getObject.mockResolvedValue(
      moveObject({
        title: 'NDA',
        description: '',
        creator: '0xalice',
        walrus_blob_id: 'blob-0',
        signed_blob_id: ['blob-1'],
        authorized_signers: ['0xbob', '0xcarol', '0xbob'],
        signatures: [
          { fields: { signer: '0xbob', signed_at: '1700' } },
          { signer: '0xcarol', signed_at: '1800' },
          { fields: {} },
        ],
        created_at: '1600',
        status: 1,
      }),
    );

    const doc = await getDocumentDetails(client, '0xdoc');

    expect(doc).toEqual({
      documentId: '0xdoc',
      title: 'NDA',
      description: '',
      creator: '0xalice',
      walrusBlobId: 'blob-0',
      signedBlobIds: ['blob-1'],
      authorizedSigners: ['0xbob', '0xcarol'],
      signatures: [
        { signer: '0xbob', signedAt: 1700 },
        { signer: '0xcarol', signedAt: 1800 },
      ],
      createdAt: 1600,
      status: 1,
    });
  });

  it('returns null for an unknown object', async () => {
    getObject.mockResolvedValue({ error: { code: 'notExists' } });
    await expect(getDocumentDetails(client, '0xmissing')).resolves.toBeNull();
  });

  it('drops documents that fail to load from a batch', async () => {
    getObject
      .mockResolvedValueOnce(moveObject({ title: 'A', authorized_signers: [], signatures: [], created_at: '1' }))
      .mockRejectedValueOnce(new Error('rpc down'));

    const docs = await getMultipleDocuments(client, ['0xa', '0xb']);
    expect(docs.map((d) => d.documentId)).toEqual(['0xa']);
  });
});

describe('getLatestBlobId', () => {
  const base = { walrusBlobId: 'original', signedBlobIds: [] as string[] } as DocumentSummary;

  it('falls back to the original upload', () => {
    expect(getLatestBlobId(base)).toBe('original');
  });

  it('prefers the newest signed version', () => {
    expect(getLatestBlobId({ ...base, signedBlobIds: ['v1', 'v2'] })).toBe('v2');
  });
});
