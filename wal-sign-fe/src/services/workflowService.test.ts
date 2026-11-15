import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SuiClient } from '@mysten/sui/client';
import type { DocumentSummary } from './registryService';

const tx = vi.hoisted(() => ({ moveCall: vi.fn() }));
vi.mock('@mysten/sui/transactions', () => ({
  Transaction: vi.fn(() => ({
    moveCall: tx.moveCall,
    object: (id: string) => ({ object: id }),
    pure: {
      bool: (v: boolean) => ({ bool: v }),
      u64: (v: number) => ({ u64: v }),
      string: (v: string) => ({ string: v }),
      address: (v: string) => ({ address: v }),
    },
  })),
}));

import { Transaction } from '@mysten/sui/transactions';
import {
  addWorkflowCalls,
  buildDeclineTx,
  buildReassignTx,
  DEFAULT_WORKFLOW,
  describeDeadline,
  DocumentWorkflow,
  findSignerCap,
  getDocumentPhase,
  getDocumentWorkflow,
  getSignerSteps,
  getSigningBlocker,
  parseDeadlineInput,
  validateDeclineReason,
  validateReassignTarget,
} from './workflowService';

const ALICE = '0x' + 'a'.repeat(64);
const BOB = '0x' + 'b'.repeat(64);
const CAROL = '0x' + 'c'.repeat(64);
const DAVE = '0x' + 'd'.repeat(64);

const doc = (overrides: Partial<DocumentSummary> = {}) =>
  ({
    documentId: '0xdoc',
    creator: ALICE,
    authorizedSigners: [BOB, CAROL, DAVE],
    signatures: [],
    status: 0,
    ...overrides,
  }) as DocumentSummary;

const sequential: DocumentWorkflow = { ...DEFAULT_WORKFLOW, sequential: true };

const getDynamicFields = vi.fn();
const getDynamicFieldObject = vi.fn();
const getOwnedObjects = vi.fn();
const client = { getDynamicFields, getDynamicFieldObject, getOwnedObjects } as unknown as SuiClient;

beforeEach(() => {
  getDynamicFields.mockReset();
});

describe('getDocumentWorkflow', () => {
  it('falls back to parallel signing without a deadline', async () => {
    getDynamicFields.mockResolvedValue({ data: [], hasNextPage: false, nextCursor: null });
    await expect(getDocumentWorkflow(client, '0xdoc')).resolves.toEqual(DEFAULT_WORKFLOW);
  });

  it.each([
    ['plain value', '5000'],
    ['option struct', { vec: ['5000'] }],
  ])('parses the workflow field (deadline as %s)', async (_label, deadline) => {
    getDynamicFields.mockResolvedValue({
      data: [{ name: { type: '0xpkg::wal_sign::WorkflowKey', value: { dummy_field: false } } }],
      hasNextPage: false,
      nextCursor: null,
    });
    getDynamicFieldObject.mockResolvedValue({
      data: {
        content: {
          dataType: 'moveObject',
          fields: {
            value: {
              fields: {
                sequential: true,
                deadline_ms: deadline,
                declines: [{ fields: { signer: BOB, reason: 'Wrong salary', declined_at: '42' } }],
              },
            },
          },
        },
      },
    });

    await expect(getDocumentWorkflow(client, '0xdoc')).resolves.toEqual({
      sequential: true,
      deadlineMs: 5000,
      declines: [{ signer: BOB, reason: 'Wrong salary', declinedAt: 42 }],
    });
  });
});

describe('getSignerSteps', () => {
  it('marks every unsigned signer pending in parallel mode', () => {
    const steps = getSignerSteps(doc({ signatures: [{ signer: CAROL, signedAt: 7 }] }), DEFAULT_WORKFLOW);
    expect(steps.map((s) => s.state)).toEqual(['pending', 'signed', 'pending']);
    expect(steps[1]).toMatchObject({ position: 2, signedAt: 7 });
  });

  it('shows who is up next in sequential mode', () => {
    const steps = getSignerSteps(doc({ signatures: [{ signer: BOB, signedAt: 1 }] }), sequential);
    expect(steps.map((s) => s.state)).toEqual(['signed', 'up-next', 'waiting']);
  });

  it('shows declines with their reason', () => {
    const decline = { signer: BOB, reason: 'No', declinedAt: 3 };
    const steps = getSignerSteps(doc({ status: 3 }), { ...sequential, declines: [decline] });
    expect(steps[0]).toMatchObject({ state: 'declined', decline });
    expect(steps.map((s) => s.state)).toEqual(['declined', 'waiting', 'waiting']);
  });
});

describe('getDocumentPhase', () => {
  it('derives the overall phase', () => {
    expect(getDocumentPhase(doc({ status: 2 }), DEFAULT_WORKFLOW, 0)).toBe('completed');
    expect(getDocumentPhase(doc({ status: 3 }), DEFAULT_WORKFLOW, 0)).toBe('declined');
    expect(getDocumentPhase(doc(), { ...DEFAULT_WORKFLOW, deadlineMs: 10 }, 11)).toBe('expired');
    expect(getDocumentPhase(doc(), { ...DEFAULT_WORKFLOW, deadlineMs: 10 }, 10)).toBe('in-progress');
  });

  it('treats a completed document as completed even past its deadline', () => {
    expect(getDocumentPhase(doc({ status: 2 }), { ...DEFAULT_WORKFLOW, deadlineMs: 10 }, 99)).toBe('completed');
  });
});

describe('getSigningBlocker', () => {
  it('allows the next signer', () => {
    expect(getSigningBlocker(doc(), sequential, BOB, 0)).toBeNull();
    expect(getSigningBlocker(doc(), DEFAULT_WORKFLOW, DAVE, 0)).toBeNull();
  });

  it('mirrors the on-chain rules', () => {
    expect(getSigningBlocker(doc(), DEFAULT_WORKFLOW, ALICE, 0)).toMatch(/not a signer/);
    expect(getSigningBlocker(doc({ signatures: [{ signer: BOB, signedAt: 1 }] }), DEFAULT_WORKFLOW, BOB, 0)).toMatch(
      /already signed/,
    );
    expect(getSigningBlocker(doc(), sequential, CAROL, 0)).toBe('Waiting for signer #1 to sign first.');
    expect(getSigningBlocker(doc(), { ...DEFAULT_WORKFLOW, deadlineMs: 5 }, BOB, 6)).toMatch(/deadline has passed/);
  });

  it('explains a declined document to the decliner and to others', () => {
    const declined = { ...DEFAULT_WORKFLOW, declines: [{ signer: BOB, reason: 'x', declinedAt: 1 }] };
    expect(getSigningBlocker(doc(), declined, BOB, 0)).toMatch(/You declined/);
    expect(getSigningBlocker(doc(), declined, CAROL, 0)).toMatch(/Signing is paused/);
  });
});

describe('describeDeadline', () => {
  const now = 1_000_000_000;
  it.each([
    [now + 3 * 86_400_000 + 5, 'Due in 3 days'],
    [now + 3_600_000, 'Due in 1 hour'],
    [now + 10_000, 'Due in 1 minute'],
    [now - 2 * 3_600_000, 'Overdue by 2 hours'],
  ])('describes %s', (deadline, text) => {
    expect(describeDeadline(deadline, now)).toBe(text);
  });
});

describe('validation', () => {
  it('parses a future deadline', () => {
    const now = new Date('2026-01-01T10:00').getTime();
    expect(parseDeadlineInput('2026-01-02T10:00', now)).toEqual({ deadlineMs: new Date('2026-01-02T10:00').getTime() });
    expect(parseDeadlineInput('2025-12-31T10:00', now)).toEqual({ error: 'The deadline must be in the future' });
    expect(parseDeadlineInput('', now)).toEqual({ error: 'Choose a date and time' });
    expect(parseDeadlineInput('not a date', now)).toEqual({ error: 'Invalid date' });
  });

  it('requires a short, non-empty decline reason', () => {
    expect(validateDeclineReason('Wrong start date')).toBeNull();
    expect(validateDeclineReason('  ')).toMatch(/why you are declining/);
    expect(validateDeclineReason('é'.repeat(251))).toMatch(/too long/);
  });

  it('requires a new, valid signer address for reassignment', () => {
    expect(validateReassignTarget(doc(), ALICE)).toBeNull();
    expect(validateReassignTarget(doc(), BOB)).toBe('This address is already a signer');
    expect(validateReassignTarget(doc(), '0x12')).toBe('Enter a valid Sui address');
  });
});

describe('transactions', () => {
  it('appends only the requested settings', () => {
    addWorkflowCalls(new Transaction(), '0xdoc', {});
    expect(tx.moveCall).not.toHaveBeenCalled();

    addWorkflowCalls(new Transaction(), '0xdoc', { sequential: true, deadlineMs: 900 });
    expect(tx.moveCall.mock.calls.map((c) => c[0])).toEqual([
      { target: '0xpackage::wal_sign::set_signing_order', arguments: [{ object: '0xdoc' }, { bool: true }] },
      {
        target: '0xpackage::wal_sign::set_deadline',
        arguments: [{ object: '0xdoc' }, { u64: 900 }, { object: '0x6' }],
      },
    ]);
  });

  it('clears the deadline when asked', () => {
    addWorkflowCalls(new Transaction(), '0xdoc', { deadlineMs: null });
    expect(tx.moveCall.mock.calls[0][0].target).toBe('0xpackage::wal_sign::clear_deadline');
  });

  it('builds decline and reassign calls', () => {
    buildDeclineTx('0xdoc', '0xcap', '  Wrong salary ');
    buildReassignTx('0xdoc', BOB, ` ${CAROL} `);
    expect(tx.moveCall.mock.calls[0][0]).toEqual({
      target: '0xpackage::wal_sign::decline_document',
      arguments: [{ object: '0xdoc' }, { object: '0xcap' }, { string: 'Wrong salary' }, { object: '0x6' }],
    });
    expect(tx.moveCall.mock.calls[1][0]).toEqual({
      target: '0xpackage::wal_sign::reassign_signer',
      arguments: [{ object: '0xregistry' }, { object: '0xdoc' }, { address: BOB }, { address: CAROL }, { object: '0x6' }],
    });
  });
});

describe('findSignerCap', () => {
  it('pages through owned caps until it finds the one for the document', async () => {
    const cap = (id: string, documentId: string) => ({
      data: { objectId: id, content: { dataType: 'moveObject', fields: { document_id: documentId } } },
    });
    getOwnedObjects
      .mockResolvedValueOnce({ data: [cap('0xc1', '0xother')], hasNextPage: true, nextCursor: 'n' })
      .mockResolvedValueOnce({ data: [cap('0xc2', '0xdoc')], hasNextPage: false, nextCursor: null });

    await expect(findSignerCap(client, BOB, '0xdoc')).resolves.toBe('0xc2');
    expect(getOwnedObjects.mock.calls[0][0].filter).toEqual({ StructType: '0xpackage::wal_sign::SignerCap' });
  });

  it('returns null when the user holds no cap for the document', async () => {
    getOwnedObjects.mockResolvedValue({ data: [], hasNextPage: false, nextCursor: null });
    await expect(findSignerCap(client, BOB, '0xdoc')).resolves.toBeNull();
  });
});
