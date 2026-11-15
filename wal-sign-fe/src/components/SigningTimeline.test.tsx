import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { DocumentSummary } from '../services/registryService';
import { DEFAULT_WORKFLOW } from '../services/workflowService';
import { SigningTimeline } from './SigningTimeline';

const BOB = '0x' + 'b'.repeat(64);
const CAROL = '0x' + 'c'.repeat(64);
const NOW = new Date('2026-03-01T12:00:00Z').getTime();

const document = {
  documentId: '0xdoc',
  creator: '0xalice',
  authorizedSigners: [BOB, CAROL],
  signatures: [{ signer: BOB, signedAt: NOW - 1000 }],
  createdAt: NOW - 86_400_000,
  status: 1,
} as DocumentSummary;

function renderTimeline(props: Partial<Parameters<typeof SigningTimeline>[0]> = {}) {
  const onReassign = vi.fn();
  render(
    <SigningTimeline
      document={document}
      workflow={DEFAULT_WORKFLOW}
      now={NOW}
      canManage={false}
      onReassign={onReassign}
      {...props}
    />,
  );
  return { onReassign };
}

describe('SigningTimeline', () => {
  it('lists every signer with their state', () => {
    renderTimeline({ currentAddress: BOB });
    const items = within(screen.getByRole('list', { name: /signing timeline/i })).getAllByRole('listitem');

    expect(items).toHaveLength(3); // sent + two signers
    expect(items[1]).toHaveTextContent('You');
    expect(items[1]).toHaveAttribute('data-state', 'signed');
    expect(items[2]).toHaveTextContent('Awaiting signature');
    expect(screen.getByText('Any order')).toBeInTheDocument();
  });

  it('shows the order, who is next and the deadline in sequential mode', () => {
    renderTimeline({ workflow: { ...DEFAULT_WORKFLOW, sequential: true, deadlineMs: NOW + 2 * 86_400_000 } });

    expect(screen.getByText('Sequential signing')).toBeInTheDocument();
    expect(screen.getByText('Due in 2 days')).toBeInTheDocument();
    expect(screen.getByText('#2')).toBeInTheDocument();
    expect(screen.getByText('Up next')).toBeInTheDocument();
  });

  it('warns when the deadline has passed', () => {
    renderTimeline({ workflow: { ...DEFAULT_WORKFLOW, deadlineMs: NOW - 3_600_000 } });
    expect(screen.getByText('Overdue by 1 hour')).toBeInTheDocument();
    expect(screen.getByText(/deadline has passed/i)).toBeInTheDocument();
  });

  it('shows a decline with its reason', () => {
    renderTimeline({
      document: { ...document, status: 3 },
      workflow: { ...DEFAULT_WORKFLOW, declines: [{ signer: CAROL, reason: 'Wrong address', declinedAt: NOW }] },
    });
    expect(screen.getByText('Declined', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('“Wrong address”')).toBeInTheDocument();
  });

  it('lets the creator reassign signers who have not signed', async () => {
    const { onReassign } = renderTimeline({ canManage: true });

    const buttons = screen.getAllByRole('button', { name: /reassign/i });
    expect(buttons).toHaveLength(1);
    await userEvent.click(buttons[0]);
    expect(onReassign).toHaveBeenCalledWith(CAROL);
  });

  it('marks a completed document and hides management actions', () => {
    renderTimeline({
      canManage: true,
      document: {
        ...document,
        status: 2,
        signatures: [...document.signatures, { signer: CAROL, signedAt: NOW }],
      },
    });
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reassign/i })).not.toBeInTheDocument();
  });
});
