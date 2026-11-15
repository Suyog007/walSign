import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentSummary } from '../services/registryService';

const mocks = vi.hoisted(() => ({
  account: { address: '0xbob' } as { address: string } | null,
  thread: {} as Record<string, unknown>,
}));

vi.mock('@mysten/dapp-kit', () => ({ useCurrentAccount: () => mocks.account }));
vi.mock('../hooks/useDocumentThread', () => ({ useDocumentThread: () => mocks.thread }));

import { DocumentThreadPanel } from './DocumentThreadPanel';

const document = { documentId: '0xdoc', creator: '0xalice', authorizedSigners: ['0xbob', '0xcarol'] } as DocumentSummary;
const message = (index: number, sender: string) => ({ index, sender, ciphertext: new Uint8Array(), postedAt: 0 });

function setThread(overrides: Record<string, unknown> = {}) {
  mocks.thread = {
    messages: [],
    plaintexts: {},
    isParticipant: true,
    isLoading: false,
    isUnlocking: false,
    isUnlocked: false,
    isPosting: false,
    error: null,
    reload: vi.fn(),
    unlock: vi.fn(),
    post: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

beforeEach(() => {
  mocks.account = { address: '0xbob' };
  setThread();
});

describe('DocumentThreadPanel', () => {
  it('asks visitors to connect a wallet', () => {
    mocks.account = null;
    render(<DocumentThreadPanel document={document} />);
    expect(screen.getByText(/connect your wallet/i)).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('hides the discussion from non-participants', () => {
    setThread({ isParticipant: false });
    render(<DocumentThreadPanel document={document} />);
    expect(screen.getByText(/only the document's creator and signers/i)).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('shows a loading state', () => {
    setThread({ isLoading: true });
    render(<DocumentThreadPanel document={document} />);
    expect(screen.getByText(/loading discussion/i)).toBeInTheDocument();
  });

  it('shows the empty state with a composer and the participant count', () => {
    render(<DocumentThreadPanel document={document} />);
    expect(screen.getByText(/no messages yet/i)).toBeInTheDocument();
    expect(screen.getByText(/encrypted for 3 participants/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
  });

  it('offers to decrypt a locked thread', async () => {
    const unlock = vi.fn();
    setThread({ messages: [message(0, '0xalice'), message(1, '0xcarol')], unlock });
    render(<DocumentThreadPanel document={document} />);

    expect(screen.getByText('2 encrypted messages')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /decrypt messages/i }));
    expect(unlock).toHaveBeenCalled();
  });

  it('renders decrypted messages and marks unreadable ones', () => {
    setThread({
      isUnlocked: true,
      messages: [message(0, '0xalice'), message(1, '0xbob'), message(2, '0xcarol')],
      plaintexts: { 0: 'Can we move the start date?', 1: 'Fine by me', 2: null },
    });
    render(<DocumentThreadPanel document={document} />);

    expect(screen.getByText('Can we move the start date?')).toBeInTheDocument();
    expect(screen.getByText('Fine by me')).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getByText(/could not be decrypted/i)).toBeInTheDocument();
  });

  it('posts the draft and clears it on success', async () => {
    const post = vi.fn().mockResolvedValue(true);
    setThread({ post });
    render(<DocumentThreadPanel document={document} />);

    const input = screen.getByRole('textbox', { name: /message/i });
    await userEvent.type(input, 'Signed on my side');
    await userEvent.click(screen.getByRole('button', { name: /send/i }));

    expect(post).toHaveBeenCalledWith('Signed on my side');
    expect(input).toHaveValue('');
  });

  it('keeps the draft when posting fails and shows the error', async () => {
    setThread({ post: vi.fn().mockResolvedValue(false), error: 'User rejected the request' });
    render(<DocumentThreadPanel document={document} />);

    const input = screen.getByRole('textbox', { name: /message/i });
    await userEvent.type(input, 'hello');
    await userEvent.click(screen.getByRole('button', { name: /send/i }));

    expect(input).toHaveValue('hello');
    expect(screen.getByRole('alert')).toHaveTextContent('User rejected the request');
  });

  it('blocks drafts over the length limit', async () => {
    render(<DocumentThreadPanel document={document} />);
    const input = screen.getByRole('textbox', { name: /message/i });
    await userEvent.click(input);
    await userEvent.paste('x'.repeat(2001));
    expect(screen.getByText('2001/2000')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
  });
});
