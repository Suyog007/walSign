import { describe, expect, it } from 'vitest';
import { pendingSigners } from '../src/notifier.js';
import { ALICE, BOB, CAROL, DAVE, DOC, documentState, rawEvent, setup } from './helpers.js';

const HOUR = 3_600_000;
const recipients = (sent: Array<{ to: string; subject: string }>) => sent.map((m) => `${m.to}: ${m.subject}`);

describe('pendingSigners', () => {
  it('returns everyone who has not signed, or only the next one in sequential mode', () => {
    const doc = documentState({ signers: [BOB, CAROL, DAVE], signed: [BOB] });
    expect(pendingSigners(doc)).toEqual([CAROL, DAVE]);
    expect(pendingSigners({ ...doc, sequential: true })).toEqual([CAROL]);
    expect(pendingSigners({ ...doc, status: 3 })).toEqual([]);
    expect(pendingSigners({ ...doc, status: 2 })).toEqual([]);
  });
});

describe('Notifier.poll', () => {
  it('invites every signer except the creator when a document is created', async () => {
    const { notifier, sent } = setup({
      pages: [[rawEvent('DocumentCreated', { creator: ALICE, title: 'Lease', authorized_signers: [ALICE, BOB, CAROL] })]],
    });

    await notifier.poll();

    expect(recipients(sent)).toEqual([
      'bob@example.com: You have been asked to sign "Lease"',
      'carol@example.com: You have been asked to sign "Lease"',
    ]);
    expect(sent[0].text).toContain(`https://walsign.test/sign/${DOC}`);
  });

  it('skips signers without an email address', async () => {
    const { notifier, sent } = setup({
      contacts: { [CAROL]: 'carol@example.com' },
      pages: [[rawEvent('DocumentCreated', { creator: ALICE, title: 'Lease', authorized_signers: [BOB, CAROL] })]],
    });
    await notifier.poll();
    expect(sent.map((m) => m.to)).toEqual(['carol@example.com']);
  });

  it('tells the first signer it is their turn when sequential signing is switched on', async () => {
    const { notifier, sent } = setup({
      document: documentState({ sequential: true }),
      pages: [[rawEvent('SigningOrderSet', { sequential: true })]],
    });
    await notifier.poll();
    expect(recipients(sent)).toEqual(['bob@example.com: Your turn to sign "Lease"']);
  });

  it('ignores switching back to parallel signing', async () => {
    const { notifier, sent, getDocument } = setup({ pages: [[rawEvent('SigningOrderSet', { sequential: false })]] });
    await notifier.poll();
    expect(sent).toEqual([]);
    expect(getDocument).not.toHaveBeenCalled();
  });

  it('notifies the next signer after each signature in sequential mode only', async () => {
    const sequential = setup({
      document: documentState({ sequential: true, signed: [BOB], status: 1 }),
      pages: [[rawEvent('DocumentSigned', { signer: BOB })]],
    });
    await sequential.notifier.poll();
    expect(recipients(sequential.sent)).toEqual(['carol@example.com: Your turn to sign "Lease"']);

    const parallel = setup({
      document: documentState({ signed: [BOB], status: 1 }),
      pages: [[rawEvent('DocumentSigned', { signer: BOB })]],
    });
    await parallel.notifier.poll();
    expect(parallel.sent).toEqual([]);
  });

  it('invites a reassigned signer, or tells them it is their turn when they are next', async () => {
    const waiting = setup({
      document: documentState({ signers: [BOB, DAVE], sequential: true }),
      pages: [[rawEvent('SignerReassigned', { from: CAROL, to: DAVE })]],
    });
    await waiting.notifier.poll();
    expect(recipients(waiting.sent)).toEqual(['dave@example.com: You have been asked to sign "Lease"']);

    const next = setup({
      document: documentState({ signers: [DAVE, CAROL], sequential: true }),
      pages: [[rawEvent('SignerReassigned', { from: BOB, to: DAVE })]],
    });
    await next.notifier.poll();
    expect(recipients(next.sent)).toEqual(['dave@example.com: Your turn to sign "Lease"']);
  });

  it('tells the creator and all signers once the document is complete', async () => {
    const { notifier, sent, state } = setup({
      document: documentState({ signers: [ALICE, BOB], signed: [ALICE, BOB], status: 2 }),
      state: { cursor: null, deadlines: { [DOC]: { deadlineMs: 10, warned: false } } },
      pages: [[rawEvent('DocumentCompleted', { timestamp: '5' })]],
    });
    await notifier.poll();

    expect(recipients(sent)).toEqual([
      'alice@example.com: "Lease" has been signed by everyone',
      'bob@example.com: "Lease" has been signed by everyone',
    ]);
    expect(state.current.deadlines).toEqual({});
  });

  it('tracks and clears deadlines', async () => {
    const { notifier, state } = setup({
      pages: [[rawEvent('DeadlineSet', { deadline_ms: '5000' })], [rawEvent('DeadlineSet', { deadline_ms: null })]],
    });
    await notifier.poll();
    expect(state.saved[0].deadlines).toEqual({ [DOC]: { deadlineMs: 5000, warned: false } });
    expect(state.current.deadlines).toEqual({});
  });

  it('saves the cursor after every event and resumes from it', async () => {
    const first = rawEvent('SigningOrderSet', { sequential: false });
    const second = rawEvent('DocumentSigned', { signer: BOB });
    const { notifier, events, state } = setup({ pages: [[first], [second]] });

    await expect(notifier.poll()).resolves.toBe(2);
    expect(state.saved.map((s) => s.cursor)).toEqual([first.id, second.id]);
    expect(events.cursors).toEqual([null, first.id]);

    events.push([]);
    await expect(notifier.poll()).resolves.toBe(0);
    expect(events.cursors[2]).toEqual(second.id);
  });

  it('keeps the cursor before an event whose document cannot be read, so it is retried', async () => {
    const created = rawEvent('DocumentCreated', { creator: ALICE, title: 'Lease', authorized_signers: [BOB] });
    const signed = rawEvent('DocumentSigned', { signer: BOB });
    const { notifier, state, getDocument } = setup({ pages: [[created, signed]] });
    getDocument.mockRejectedValueOnce(new Error('rpc down'));

    await expect(notifier.poll()).rejects.toThrow('rpc down');
    expect(state.current.cursor).toEqual(created.id);
  });

  it('keeps going when an email cannot be delivered', async () => {
    const { notifier, send, logger, state } = setup({
      pages: [[rawEvent('DocumentCreated', { creator: ALICE, title: 'Lease', authorized_signers: [BOB, CAROL] })]],
    });
    send.mockRejectedValueOnce(new Error('mailbox full'));

    await notifier.poll();

    expect(send).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('mailbox full'));
    expect(state.current.cursor).not.toBeNull();
  });

  it('ignores unrelated events', async () => {
    const { notifier, sent, getDocument } = setup({
      pages: [[{ id: { txDigest: 'x', eventSeq: '0' }, type: '0xpkg::wal_sign::Unknown', parsedJson: {} }]],
    });
    await expect(notifier.poll()).resolves.toBe(1);
    expect(sent).toEqual([]);
    expect(getDocument).not.toHaveBeenCalled();
  });
});

describe('Notifier.checkDeadlines', () => {
  const deadline = 100 * HOUR;

  it('reminds pending signers once when the deadline is within the warning window', async () => {
    const { notifier, sent, state } = setup({
      now: deadline - 2 * HOUR,
      document: documentState({ signed: [BOB], status: 1, deadlineMs: deadline }),
      state: { cursor: null, deadlines: { [DOC]: { deadlineMs: deadline, warned: false } } },
    });

    await expect(notifier.checkDeadlines()).resolves.toBe(1);
    await expect(notifier.checkDeadlines()).resolves.toBe(0);

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('carol@example.com');
    expect(sent[0].subject).toContain('Reminder: "Lease" is due');
    expect(state.current.deadlines[DOC].warned).toBe(true);
  });

  it('waits until the warning window opens', async () => {
    const { notifier, getDocument } = setup({
      now: deadline - 30 * HOUR,
      state: { cursor: null, deadlines: { [DOC]: { deadlineMs: deadline, warned: false } } },
    });
    await expect(notifier.checkDeadlines()).resolves.toBe(0);
    expect(getDocument).not.toHaveBeenCalled();
  });

  it('only reminds the signer whose turn it is in sequential mode', async () => {
    const { notifier, sent } = setup({
      now: deadline - HOUR,
      document: documentState({ sequential: true, deadlineMs: deadline }),
      state: { cursor: null, deadlines: { [DOC]: { deadlineMs: deadline, warned: false } } },
    });
    await notifier.checkDeadlines();
    expect(sent.map((m) => m.to)).toEqual(['bob@example.com']);
  });

  it('skips completed documents and deadlines that changed on chain', async () => {
    const completed = setup({
      now: deadline - HOUR,
      document: documentState({ status: 2, deadlineMs: deadline }),
      state: { cursor: null, deadlines: { [DOC]: { deadlineMs: deadline, warned: false } } },
    });
    await expect(completed.notifier.checkDeadlines()).resolves.toBe(0);

    const moved = setup({
      now: deadline - HOUR,
      document: documentState({ deadlineMs: deadline * 2 }),
      state: { cursor: null, deadlines: { [DOC]: { deadlineMs: deadline, warned: false } } },
    });
    await expect(moved.notifier.checkDeadlines()).resolves.toBe(0);
  });

  it('forgets deadlines that have passed', async () => {
    const { notifier, state } = setup({
      now: deadline + 1,
      state: { cursor: null, deadlines: { [DOC]: { deadlineMs: deadline, warned: false } } },
    });
    await notifier.checkDeadlines();
    expect(state.current.deadlines).toEqual({});
  });
});
