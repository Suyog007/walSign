import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OrderedSignerList, SigningRulesFields } from './SigningRulesFields';

const A = '0x' + 'a'.repeat(64);
const B = '0x' + 'b'.repeat(64);
const C = '0x' + 'c'.repeat(64);

function StatefulList({ initial, showOrder }: { initial: string[]; showOrder: boolean }) {
  const [signers, setSigners] = useState(initial);
  return <OrderedSignerList signers={signers} onChange={setSigners} showOrder={showOrder} />;
}

const order = () =>
  within(screen.getByRole('list', { name: 'Signers' }))
    .getAllByRole('listitem')
    .map((item) => item.getAttribute('title'));

describe('OrderedSignerList', () => {
  it('reorders signers when the order matters', async () => {
    render(<StatefulList initial={[A, B, C]} showOrder />);

    await userEvent.click(screen.getByRole('button', { name: /move 0xcccc\.\.\.cccc up/i }));
    expect(order()).toEqual([A, C, B]);

    await userEvent.click(screen.getByRole('button', { name: /move 0xaaaa\.\.\.aaaa down/i }));
    expect(order()).toEqual([C, A, B]);
    expect(screen.getByRole('button', { name: /move 0xcccc\.\.\.cccc up/i })).toBeDisabled();
  });

  it('hides ordering controls for parallel signing but still allows removal', async () => {
    render(<StatefulList initial={[A, B]} showOrder={false} />);
    expect(screen.queryByRole('button', { name: /^move/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /remove 0xaaaa/i }));
    expect(order()).toEqual([B]);
  });
});

describe('SigningRulesFields', () => {
  it('reports changes to the order toggle and the deadline', async () => {
    const onSequentialChange = vi.fn();
    const onDeadlineChange = vi.fn();
    render(
      <SigningRulesFields
        sequential={false}
        onSequentialChange={onSequentialChange}
        deadline="2030-01-01T10:00"
        onDeadlineChange={onDeadlineChange}
      />,
    );

    await userEvent.click(screen.getByRole('checkbox', { name: /sign in order/i }));
    expect(onSequentialChange).toHaveBeenCalledWith(true);

    await userEvent.click(screen.getByRole('button', { name: /no deadline/i }));
    expect(onDeadlineChange).toHaveBeenCalledWith('');
  });

  it('locks the order with an explanation and shows deadline errors', () => {
    render(
      <SigningRulesFields
        sequential
        onSequentialChange={vi.fn()}
        sequentialLockedReason="The order is fixed once someone has signed."
        deadline=""
        onDeadlineChange={vi.fn()}
        deadlineError="The deadline must be in the future"
      />,
    );

    expect(screen.getByRole('checkbox', { name: /sign in order/i })).toBeDisabled();
    expect(screen.getByText('The order is fixed once someone has signed.')).toBeInTheDocument();
    expect(screen.getByText('The deadline must be in the future')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /no deadline/i })).not.toBeInTheDocument();
  });
});
