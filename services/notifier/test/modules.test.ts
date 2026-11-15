import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ContactDirectory } from '../src/contacts.js';
import { parseEvent } from '../src/events.js';
import { renderMessage } from '../src/messages.js';
import { FileStateStore } from '../src/state.js';
import { ALICE, BOB, DOC, rawEvent } from './helpers.js';

describe('parseEvent', () => {
  it('maps walSign events', () => {
    expect(parseEvent(rawEvent('DocumentCreated', { creator: ALICE, title: 'NDA', authorized_signers: [BOB] }))).toEqual({
      kind: 'created',
      documentId: DOC,
      creator: ALICE,
      title: 'NDA',
      signers: [BOB],
    });
    expect(parseEvent(rawEvent('DocumentSigned', { signer: BOB }))).toEqual({ kind: 'signed', documentId: DOC, signer: BOB });
    expect(parseEvent(rawEvent('SignerReassigned', { from: ALICE, to: BOB }))).toEqual({
      kind: 'reassigned',
      documentId: DOC,
      from: ALICE,
      to: BOB,
    });
    expect(parseEvent(rawEvent('DocumentCompleted', {}))).toEqual({ kind: 'completed', documentId: DOC });
    expect(parseEvent(rawEvent('SigningOrderSet', { sequential: true }))).toMatchObject({ sequential: true });
  });

  it('reads both Option encodings of a deadline', () => {
    expect(parseEvent(rawEvent('DeadlineSet', { deadline_ms: '9' }))).toMatchObject({ deadlineMs: 9 });
    expect(parseEvent(rawEvent('DeadlineSet', { deadline_ms: { vec: ['9'] } }))).toMatchObject({ deadlineMs: 9 });
    expect(parseEvent(rawEvent('DeadlineSet', { deadline_ms: { vec: [] } }))).toMatchObject({ deadlineMs: null });
  });

  it('ignores other events', () => {
    expect(parseEvent(rawEvent('DocumentDeclined', { signer: BOB, reason: 'x' }))).toBeNull();
  });
});

describe('ContactDirectory', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'notifier-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('looks addresses up case-insensitively', () => {
    const contacts = new ContactDirectory({ [ALICE.toUpperCase().replace('0X', '0x')]: 'alice@example.com' });
    expect(contacts.emailFor(ALICE)).toBe('alice@example.com');
    expect(contacts.emailFor(BOB)).toBeUndefined();
    expect(contacts.size).toBe(1);
  });

  it('rejects invalid entries', () => {
    expect(() => new ContactDirectory({ 'not-an-address': 'a@b.co' })).toThrow('Invalid Sui address');
    expect(() => new ContactDirectory({ [ALICE]: 'not-an-email' })).toThrow('Invalid email');
  });

  it('loads a JSON file and explains a missing one', async () => {
    const path = join(dir, 'contacts.json');
    await writeFile(path, JSON.stringify({ [BOB]: 'bob@example.com' }));
    expect((await ContactDirectory.fromFile(path)).emailFor(BOB)).toBe('bob@example.com');

    await expect(ContactDirectory.fromFile(join(dir, 'missing.json'))).rejects.toThrow('Contacts file not found');
    await writeFile(path, '[]');
    await expect(ContactDirectory.fromFile(path)).rejects.toThrow('must be a JSON object');
  });
});

describe('FileStateStore', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'notifier-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('starts empty and round-trips the state', async () => {
    const store = new FileStateStore(join(dir, 'state.json'));
    await expect(store.load()).resolves.toEqual({ cursor: null, deadlines: {} });

    const state = { cursor: { txDigest: 'tx', eventSeq: '1' }, deadlines: { [DOC]: { deadlineMs: 5, warned: true } } };
    await store.save(state);
    await expect(store.load()).resolves.toEqual(state);
    expect(JSON.parse(await readFile(join(dir, 'state.json'), 'utf8'))).toEqual(state);
  });

  it('surfaces a corrupt state file instead of starting over', async () => {
    const path = join(dir, 'state.json');
    await writeFile(path, '{oops');
    await expect(new FileStateStore(path).load()).rejects.toThrow();
  });
});

describe('renderMessage', () => {
  const link = 'https://walsign.test/sign/0xdoc';

  it.each([
    ['invited', 'You have been asked to sign "NDA"'],
    ['your-turn', 'Your turn to sign "NDA"'],
    ['completed', '"NDA" has been signed by everyone'],
  ] as const)('renders %s', (kind, subject) => {
    const message = renderMessage('bob@example.com', { kind, title: 'NDA', link });
    expect(message.to).toBe('bob@example.com');
    expect(message.subject).toBe(subject);
    expect(message.text).toContain(link);
  });

  it('mentions the deadline when there is one', () => {
    const deadlineMs = Date.UTC(2030, 0, 2, 12);
    const message = renderMessage('bob@example.com', { kind: 'deadline-approaching', title: 'NDA', link, deadlineMs });
    expect(message.subject).toBe('Reminder: "NDA" is due Wed, 02 Jan 2030 12:00:00 GMT');
    expect(message.text).toContain('Please sign before Wed, 02 Jan 2030 12:00:00 GMT');
  });
});
