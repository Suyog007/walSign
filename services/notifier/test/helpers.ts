import { vi } from 'vitest';
import { ContactDirectory } from '../src/contacts.js';
import { RawEvent } from '../src/events.js';
import { EmailMessage } from '../src/messages.js';
import { Notifier } from '../src/notifier.js';
import { emptyState, NotifierState, StateStore } from '../src/state.js';
import { DocumentState, EventCursor, EventSource } from '../src/sui.js';

export const ALICE = '0x' + 'a'.repeat(64);
export const BOB = '0x' + 'b'.repeat(64);
export const CAROL = '0x' + 'c'.repeat(64);
export const DAVE = '0x' + 'd'.repeat(64);
export const DOC = '0x' + 'f'.repeat(64);

let seq = 0;
export function rawEvent(name: string, json: Record<string, unknown>): RawEvent {
  seq++;
  return {
    id: { txDigest: `tx${seq}`, eventSeq: '0' },
    type: `0xpkg::wal_sign::${name}`,
    parsedJson: { document_id: DOC, ...json },
  };
}

/** Event source serving fixed pages, recording the cursors it was asked for */
export class FakeEventSource implements EventSource {
  cursors: Array<EventCursor | null> = [];
  constructor(private pages: RawEvent[][]) {}

  push(events: RawEvent[]) {
    this.pages.push(events);
  }

  async fetchPage(cursor: EventCursor | null) {
    this.cursors.push(cursor);
    const events = this.pages.shift() ?? [];
    return {
      events,
      nextCursor: events.length ? events[events.length - 1].id : cursor,
      hasNextPage: this.pages.length > 0,
    };
  }
}

export class MemoryStateStore implements StateStore {
  saved: NotifierState[] = [];
  constructor(private state: NotifierState = emptyState()) {}
  async load() {
    return structuredClone(this.state);
  }
  async save(state: NotifierState) {
    this.state = structuredClone(state);
    this.saved.push(this.state);
  }
  get current() {
    return this.state;
  }
}

export function documentState(overrides: Partial<DocumentState> = {}): DocumentState {
  return {
    documentId: DOC,
    title: 'Lease',
    creator: ALICE,
    signers: [BOB, CAROL],
    signed: [],
    status: 0,
    sequential: false,
    deadlineMs: null,
    ...overrides,
  };
}

export function setup(options: {
  pages?: RawEvent[][];
  document?: DocumentState | null;
  state?: NotifierState;
  now?: number;
  contacts?: Record<string, string>;
}) {
  const events = new FakeEventSource(options.pages ?? []);
  const getDocument = vi.fn().mockResolvedValue(options.document === undefined ? documentState() : options.document);
  const sent: EmailMessage[] = [];
  const send = vi.fn(async (message: EmailMessage) => {
    sent.push(message);
  });
  const state = new MemoryStateStore(options.state);
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const notifier = new Notifier({
    events,
    documents: { getDocument },
    contacts: new ContactDirectory(
      options.contacts ?? {
        [ALICE]: 'alice@example.com',
        [BOB]: 'bob@example.com',
        [CAROL]: 'carol@example.com',
        [DAVE]: 'dave@example.com',
      },
    ),
    mail: { send },
    state,
    appBaseUrl: 'https://walsign.test',
    deadlineWarningMs: 24 * 3_600_000,
    logger,
    now: () => options.now ?? 0,
  });
  return { notifier, events, getDocument, sent, send, state, logger };
}
