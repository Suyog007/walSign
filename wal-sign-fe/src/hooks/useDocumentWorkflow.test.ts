import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const getDocumentWorkflow = vi.hoisted(() => vi.fn());
vi.mock('../services/workflowService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/workflowService')>()),
  getDocumentWorkflow,
}));

import { useDocumentWorkflow } from './useDocumentWorkflow';
import { DEFAULT_WORKFLOW } from '../services/workflowService';

describe('useDocumentWorkflow', () => {
  it('loads the workflow of the document', async () => {
    const workflow = { sequential: true, deadlineMs: 10, declines: [] };
    getDocumentWorkflow.mockResolvedValue(workflow);

    const { result } = renderHook(() => useDocumentWorkflow('0xdoc'));

    await waitFor(() => expect(result.current.workflow).toEqual(workflow));
    expect(getDocumentWorkflow).toHaveBeenCalledWith(expect.anything(), '0xdoc');
  });

  it('keeps the defaults and reports an error when loading fails', async () => {
    getDocumentWorkflow.mockRejectedValue(new Error('rpc down'));
    const { result } = renderHook(() => useDocumentWorkflow('0xdoc'));

    await waitFor(() => expect(result.current.error).toBe('rpc down'));
    expect(result.current.workflow).toEqual(DEFAULT_WORKFLOW);
    expect(result.current.isLoading).toBe(false);
  });

  it('does nothing without a document id', () => {
    getDocumentWorkflow.mockClear();
    renderHook(() => useDocumentWorkflow(undefined));
    expect(getDocumentWorkflow).not.toHaveBeenCalled();
  });
});
