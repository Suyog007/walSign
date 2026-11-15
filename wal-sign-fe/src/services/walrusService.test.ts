import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkBlobExists, downloadFromWalrus, uploadToWalrus } from './walrusService';

const fetchMock = vi.fn();

function jsonResponse(body: unknown, init: ResponseInit = { status: 200 }) {
  return new Response(JSON.stringify(body), init);
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('uploadToWalrus', () => {
  it('PUTs the bytes to the publisher with the requested storage duration', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ newlyCreated: { blobObject: { id: '0x1', blobId: 'blob-new' } } }));

    const blobId = await uploadToWalrus(new Uint8Array([1, 2, 3]), 7);

    expect(blobId).toBe('blob-new');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://publisher.test/v1/blobs?epochs=7');
    expect(init.method).toBe('PUT');
  });

  it('uses the default duration when none is given', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ newlyCreated: { blobObject: { id: '0x1', blobId: 'b' } } }));
    await uploadToWalrus(new Uint8Array([1]));
    expect(fetchMock.mock.calls[0][0]).toBe('https://publisher.test/v1/blobs?epochs=5');
  });

  it('returns the existing blob id when the content is already certified', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ alreadyCertified: { blobId: 'blob-existing' } }));
    await expect(uploadToWalrus(new Uint8Array([1]))).resolves.toBe('blob-existing');
  });

  it('throws when the publisher rejects the upload', async () => {
    fetchMock.mockResolvedValue(new Response('quota exceeded', { status: 413, statusText: 'Payload Too Large' }));
    await expect(uploadToWalrus(new Uint8Array([1]))).rejects.toThrow(/413.*quota exceeded/);
  });

  it('throws when the response carries no blob id', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    await expect(uploadToWalrus(new Uint8Array([1]))).rejects.toThrow('Failed to get blob ID');
  });

  it.each([0, -1, 1.5])('rejects an invalid duration of %s epochs without calling Walrus', async (epochs) => {
    await expect(uploadToWalrus(new Uint8Array([1]), epochs)).rejects.toThrow('Invalid Walrus storage duration');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('downloadFromWalrus', () => {
  it('returns the blob bytes from the aggregator', async () => {
    fetchMock.mockResolvedValue(new Response(new Uint8Array([9, 8, 7])));

    const bytes = await downloadFromWalrus('blob-1');

    expect(fetchMock.mock.calls[0][0]).toBe('https://aggregator.test/v1/blobs/blob-1');
    expect(Array.from(bytes)).toEqual([9, 8, 7]);
  });

  it('rejects an empty blob id', async () => {
    await expect(downloadFromWalrus(' ')).rejects.toThrow('Blob ID is empty');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a missing blob clearly', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 404 }));
    await expect(downloadFromWalrus('gone')).rejects.toThrow('Blob not found on Walrus: gone');
  });

  it('includes the status for other failures', async () => {
    fetchMock.mockResolvedValue(new Response('boom', { status: 500, statusText: 'Server Error' }));
    await expect(downloadFromWalrus('b')).rejects.toThrow(/500/);
  });
});

describe('checkBlobExists', () => {
  it('is true when the aggregator answers the HEAD request', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    await expect(checkBlobExists('b')).resolves.toBe(true);
    expect(fetchMock.mock.calls[0][1]).toEqual({ method: 'HEAD' });
  });

  it('is false on a network error', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'));
    await expect(checkBlobExists('b')).resolves.toBe(false);
  });
});
