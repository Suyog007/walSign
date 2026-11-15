import { SuiClient } from '@mysten/sui/client';
import { RawEvent } from './events.js';

export interface EventPage {
  events: RawEvent[];
  /** Cursor to resume after this page (unchanged when the page was empty) */
  nextCursor: EventCursor | null;
}

export interface EventCursor {
  txDigest: string;
  eventSeq: string;
}

/** Where events come from; implemented over JSON-RPC in production and mocked in tests */
export interface EventSource {
  fetchPage(cursor: EventCursor | null): Promise<EventPage & { hasNextPage: boolean }>;
}

/** Current state of a document, as needed to decide who to notify */
export interface DocumentState {
  documentId: string;
  title: string;
  creator: string;
  signers: string[];
  signed: string[];
  /** 0 pending, 1 partial, 2 complete, 3 declined */
  status: number;
  sequential: boolean;
  deadlineMs: number | null;
}

export interface DocumentReader {
  getDocument(documentId: string): Promise<DocumentState | null>;
}

/** Polls walSign events of one package in ascending order */
export class SuiEventSource implements EventSource {
  constructor(
    private readonly client: SuiClient,
    private readonly packageId: string,
  ) {}

  async fetchPage(cursor: EventCursor | null) {
    const page = await this.client.queryEvents({
      query: { MoveEventModule: { package: this.packageId, module: 'wal_sign' } },
      cursor,
      order: 'ascending',
      limit: 50,
    });
    return {
      events: page.data,
      nextCursor: (page.nextCursor as EventCursor | null) ?? cursor,
      hasNextPage: page.hasNextPage,
    };
  }
}

/** Reads documents (and their Workflow dynamic field) over JSON-RPC */
export class SuiDocumentReader implements DocumentReader {
  constructor(private readonly client: SuiClient) {}

  async getDocument(documentId: string): Promise<DocumentState | null> {
    const object = await this.client.getObject({ id: documentId, options: { showContent: true } });
    const content = object.data?.content;
    if (content?.dataType !== 'moveObject') return null;
    const fields = content.fields as Record<string, any>;

    const workflow = await this.getWorkflow(documentId);
    return {
      documentId,
      title: fields.title,
      creator: fields.creator,
      signers: fields.authorized_signers ?? [],
      signed: (fields.signatures ?? []).map((s: any) => (s.fields ?? s).signer),
      status: Number(fields.status),
      sequential: Boolean(workflow?.sequential),
      deadlineMs: parseOptionalNumber(workflow?.deadline_ms),
    };
  }

  private async getWorkflow(documentId: string): Promise<Record<string, any> | null> {
    const fields = await this.client.getDynamicFields({ parentId: documentId });
    const entry = fields.data.find((f) => f.name.type.endsWith('::wal_sign::WorkflowKey'));
    if (!entry) return null;
    const field = await this.client.getDynamicFieldObject({ parentId: documentId, name: entry.name });
    const content = field.data?.content;
    if (content?.dataType !== 'moveObject') return null;
    const value = (content.fields as Record<string, any>).value;
    return value?.fields ?? value ?? null;
  }
}

function parseOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && 'vec' in (value as Record<string, unknown>)) {
    const vec = (value as { vec: unknown[] }).vec;
    return vec.length ? Number(vec[0]) : null;
  }
  return Number(value);
}
