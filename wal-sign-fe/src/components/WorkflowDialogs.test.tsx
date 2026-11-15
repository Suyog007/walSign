import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DeclineDialog } from './DeclineDialog';
import { ReassignDialog } from './ReassignDialog';

const NEW_SIGNER = '0x' + 'e'.repeat(64);

describe('DeclineDialog', () => {
  it('submits the reason and closes on success', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);
    const onClose = vi.fn();
    render(<DeclineDialog open onClose={onClose} onSubmit={onSubmit} pending={false} error={null} />);

    const submit = screen.getByRole('button', { name: /decline document/i });
    expect(submit).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Reason'), 'Wrong start date');
    await userEvent.click(submit);

    expect(onSubmit).toHaveBeenCalledWith('Wrong start date');
    expect(onClose).toHaveBeenCalled();
  });

  it('stays open and shows the error when declining fails', async () => {
    const onClose = vi.fn();
    render(
      <DeclineDialog
        open
        onClose={onClose}
        onSubmit={vi.fn().mockResolvedValue(false)}
        pending={false}
        error="User rejected the request"
      />,
    );

    await userEvent.type(screen.getByLabelText('Reason'), 'No');
    await userEvent.click(screen.getByRole('button', { name: /decline document/i }));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('User rejected the request');
  });

  it('blocks reasons over the size limit', async () => {
    render(<DeclineDialog open onClose={vi.fn()} onSubmit={vi.fn()} pending={false} error={null} />);
    await userEvent.click(screen.getByLabelText('Reason'));
    await userEvent.paste('x'.repeat(501));
    expect(screen.getByText('501/500')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /decline document/i })).toBeDisabled();
  });

  it('cannot be dismissed while the transaction is pending', async () => {
    const onClose = vi.fn();
    render(<DeclineDialog open onClose={onClose} onSubmit={vi.fn()} pending error={null} />);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('ReassignDialog', () => {
  it('is closed without a signer to replace', () => {
    render(<ReassignDialog from={null} onClose={vi.fn()} onSubmit={vi.fn()} pending={false} error={null} />);
    expect(screen.queryByText('Reassign signer')).not.toBeInTheDocument();
  });

  it('submits the new address for the selected signer', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);
    const onClose = vi.fn();
    render(<ReassignDialog from="0xbob" onClose={onClose} onSubmit={onSubmit} pending={false} error={null} />);

    await userEvent.type(screen.getByPlaceholderText('0x...'), ` ${NEW_SIGNER} `);
    await userEvent.click(screen.getByRole('button', { name: 'Reassign' }));

    expect(onSubmit).toHaveBeenCalledWith('0xbob', NEW_SIGNER);
    expect(onClose).toHaveBeenCalled();
  });

  it('shows validation errors from the action', () => {
    render(
      <ReassignDialog
        from="0xbob"
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        pending={false}
        error="This address is already a signer"
      />,
    );
    expect(screen.getByText('This address is already a signer')).toBeInTheDocument();
  });
});
