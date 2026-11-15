import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AuditEntry } from '../services/auditService';
import { AuditTrail } from './AuditTrail';

const BOB = '0x' + 'b'.repeat(64);
const entries: AuditEntry[] = [
  { kind: 'created', digest: 'Dg1aaaaaaaaaaaa', eventSeq: 0, timestampMs: 1000, actor: '0xalice', detail: 'Lease · 1 signer(s)' },
  { kind: 'declined', digest: 'Dg2bbbbbbbbbbbb', eventSeq: 0, timestampMs: 2000, actor: BOB, subject: BOB, detail: 'Wrong rent' },
  { kind: 'completed', digest: 'Dg3cccccccccccc', eventSeq: 1, timestampMs: 3000, actor: BOB },
];

describe('AuditTrail', () => {
  it('lists events in order with actor, detail and transaction', () => {
    render(<AuditTrail entries={entries} isLoading={false} error={null} onRetry={vi.fn()} />);
    const items = within(screen.getByRole('list', { name: 'Audit trail' })).getAllByRole('listitem');

    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Document created');
    expect(items[0]).toHaveTextContent('Lease · 1 signer(s)');
    expect(items[1]).toHaveTextContent('Declined0xbbbb...bbbb');
    expect(items[1]).toHaveTextContent('Wrong rent');
    expect(within(items[2]).getByTitle('Dg3cccccccccccc')).toHaveTextContent('Dg3ccccc…cccc');
  });

  it('shows loading, empty and error states', async () => {
    const onRetry = vi.fn();
    const { rerender } = render(<AuditTrail entries={[]} isLoading error={null} onRetry={onRetry} />);
    expect(screen.getByText(/loading audit trail/i)).toBeInTheDocument();

    rerender(<AuditTrail entries={[]} isLoading={false} error={null} onRetry={onRetry} />);
    expect(screen.getByText(/no on-chain activity/i)).toBeInTheDocument();

    rerender(<AuditTrail entries={[]} isLoading={false} error="rpc down" onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('rpc down');
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalled();
  });
});
