import { ContactDirectory } from './contacts.js';
import { parseEvent, WalSignEvent } from './events.js';
import { EmailMessage, NotificationKind, renderMessage } from './messages.js';
import { NotifierState, StateStore } from './state.js';
import { DocumentReader, DocumentState, EventSource } from './sui.js';

export interface MailTransport {
  send(message: EmailMessage): Promise<void>;
}

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface NotifierDeps {
  events: EventSource;
  documents: DocumentReader;
  contacts: ContactDirectory;
  mail: MailTransport;
  state: StateStore;
  appBaseUrl: string;
  deadlineWarningMs: number;
  logger: Logger;
  now?: () => number;
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Signers who still have to sign, or only the one whose turn it is in sequential mode */
export function pendingSigners(document: DocumentState): string[] {
  if (document.status === 2 || document.status === 3) return [];
  const pending = document.signers.filter((s) => !document.signed.some((d) => same(d, s)));
  return document.sequential ? pending.slice(0, 1) : pending;
}

/** Turns walSign events into email notifications */
export class Notifier {
  private state: NotifierState | null = null;
  private readonly now: () => number;

  constructor(private readonly deps: NotifierDeps) {
    this.now = deps.now ?? Date.now;
  }

  private async loadState(): Promise<NotifierState> {
    if (!this.state) this.state = await this.deps.state.load();
    return this.state;
  }

  /**
   * Process every new event. The cursor is saved after each event, so a crash
   * or RPC error resumes at the first unprocessed event.
   */
  async poll(): Promise<number> {
    const state = await this.loadState();
    let processed = 0;
    let hasNextPage = true;
    while (hasNextPage) {
      const page = await this.deps.events.fetchPage(state.cursor);
      for (const raw of page.events) {
        const event = parseEvent(raw);
        if (event) await this.handle(event, state);
        state.cursor = raw.id;
        await this.deps.state.save(state);
        processed++;
      }
      hasNextPage = page.hasNextPage && page.events.length > 0;
    }
    return processed;
  }

  /** Send "deadline approaching" reminders once per deadline */
  async checkDeadlines(): Promise<number> {
    const state = await this.loadState();
    const now = this.now();
    let sent = 0;
    for (const [documentId, tracked] of Object.entries(state.deadlines)) {
      if (tracked.deadlineMs <= now) {
        delete state.deadlines[documentId];
        await this.deps.state.save(state);
        continue;
      }
      if (tracked.warned || tracked.deadlineMs - now > this.deps.deadlineWarningMs) continue;

      const document = await this.deps.documents.getDocument(documentId);
      if (document && document.deadlineMs === tracked.deadlineMs) {
        sent += await this.notify(pendingSigners(document), 'deadline-approaching', document);
      }
      tracked.warned = true;
      await this.deps.state.save(state);
    }
    return sent;
  }

  private async handle(event: WalSignEvent, state: NotifierState): Promise<void> {
    switch (event.kind) {
      case 'created': {
        const invitees = event.signers.filter((s) => !same(s, event.creator));
        await this.notify(invitees, 'invited', {
          documentId: event.documentId,
          title: event.title,
          deadlineMs: null,
        });
        return;
      }
      case 'order-set': {
        if (!event.sequential) return;
        const document = await this.requireDocument(event.documentId);
        await this.notify(pendingSigners(document), 'your-turn', document);
        return;
      }
      case 'signed': {
        const document = await this.requireDocument(event.documentId);
        if (document.sequential) await this.notify(pendingSigners(document), 'your-turn', document);
        return;
      }
      case 'reassigned': {
        const document = await this.requireDocument(event.documentId);
        const upNext = document.sequential && pendingSigners(document).some((s) => same(s, event.to));
        await this.notify([event.to], upNext ? 'your-turn' : 'invited', document);
        return;
      }
      case 'deadline-set':
        if (event.deadlineMs === null) {
          delete state.deadlines[event.documentId];
        } else {
          state.deadlines[event.documentId] = { deadlineMs: event.deadlineMs, warned: false };
        }
        return;
      case 'completed': {
        delete state.deadlines[event.documentId];
        const document = await this.requireDocument(event.documentId);
        const everyone = [document.creator, ...document.signers];
        const unique = everyone.filter((a, i) => everyone.findIndex((b) => same(a, b)) === i);
        await this.notify(unique, 'completed', document);
        return;
      }
    }
  }

  private async requireDocument(documentId: string): Promise<DocumentState> {
    const document = await this.deps.documents.getDocument(documentId);
    if (!document) throw new Error(`Document ${documentId} not found`);
    return document;
  }

  /** Email every address that opted in; returns how many emails were sent */
  private async notify(
    addresses: string[],
    kind: NotificationKind,
    document: Pick<DocumentState, 'documentId' | 'title' | 'deadlineMs'>,
  ): Promise<number> {
    let sent = 0;
    for (const address of addresses) {
      const email = this.deps.contacts.emailFor(address);
      if (!email) continue;
      const message = renderMessage(email, {
        kind,
        title: document.title,
        link: `${this.deps.appBaseUrl}/sign/${document.documentId}`,
        deadlineMs: document.deadlineMs,
      });
      try {
        await this.deps.mail.send(message);
        sent++;
        this.deps.logger.info(`Sent ${kind} for ${document.documentId} to ${address}`);
      } catch (err) {
        // A failing mailbox must not block the event stream
        this.deps.logger.error(`Failed to send ${kind} to ${address}: ${(err as Error).message}`);
      }
    }
    return sent;
  }
}
