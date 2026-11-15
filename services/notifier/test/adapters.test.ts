import { describe, expect, it, vi } from 'vitest';
import type { SuiClient } from '@mysten/sui/client';

const sendMail = vi.hoisted(() => vi.fn());
vi.mock('nodemailer', () => ({ default: { createTransport: vi.fn(() => ({ sendMail })) } }));

import nodemailer from 'nodemailer';
import { createMailTransport } from '../src/mail.js';
import { SuiDocumentReader, SuiEventSource } from '../src/sui.js';
import { BOB, CAROL, DOC } from './helpers.js';

describe('SuiEventSource', () => {
  it('queries the wal_sign module in ascending order from the cursor', async () => {
    const queryEvents = vi.fn().mockResolvedValue({ data: [], nextCursor: null, hasNextPage: false });
    const source = new SuiEventSource({ queryEvents } as unknown as SuiClient, '0xpkg');
    const cursor = { txDigest: 'tx', eventSeq: '3' };

    const page = await source.fetchPage(cursor);

    expect(queryEvents).toHaveBeenCalledWith({
      query: { MoveEventModule: { package: '0xpkg', module: 'wal_sign' } },
      cursor,
      order: 'ascending',
      limit: 50,
    });
    expect(page).toEqual({ events: [], nextCursor: cursor, hasNextPage: false });
  });
});

describe('SuiDocumentReader', () => {
  const object = {
    data: {
      content: {
        dataType: 'moveObject',
        fields: {
          title: 'Lease',
          creator: '0xalice',
          authorized_signers: [BOB, CAROL],
          signatures: [{ fields: { signer: BOB, signed_at: '1' } }],
          status: 1,
        },
      },
    },
  };

  it('reads the document with its workflow', async () => {
    const client = {
      getObject: vi.fn().mockResolvedValue(object),
      getDynamicFields: vi.fn().mockResolvedValue({
        data: [{ name: { type: '0xpkg::wal_sign::WorkflowKey', value: { dummy_field: false } } }],
      }),
      getDynamicFieldObject: vi.fn().mockResolvedValue({
        data: {
          content: {
            dataType: 'moveObject',
            fields: { value: { fields: { sequential: true, deadline_ms: '99', declines: [] } } },
          },
        },
      }),
    } as unknown as SuiClient;

    await expect(new SuiDocumentReader(client).getDocument(DOC)).resolves.toEqual({
      documentId: DOC,
      title: 'Lease',
      creator: '0xalice',
      signers: [BOB, CAROL],
      signed: [BOB],
      status: 1,
      sequential: true,
      deadlineMs: 99,
    });
  });

  it('defaults to parallel signing without a workflow and returns null for missing documents', async () => {
    const client = {
      getObject: vi.fn().mockResolvedValueOnce(object).mockResolvedValueOnce({ error: { code: 'notExists' } }),
      getDynamicFields: vi.fn().mockResolvedValue({ data: [] }),
    } as unknown as SuiClient;
    const reader = new SuiDocumentReader(client);

    await expect(reader.getDocument(DOC)).resolves.toMatchObject({ sequential: false, deadlineMs: null });
    await expect(reader.getDocument(DOC)).resolves.toBeNull();
  });
});

describe('SMTP transport', () => {
  it('sends through nodemailer with the configured sender', async () => {
    const transport = createMailTransport(
      {
        dryRun: false,
        mailFrom: 'WalSign <no-reply@example.com>',
        smtp: { host: 'smtp.example.com', port: 587, secure: false, user: 'u', pass: 'p' },
      } as never,
      { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    );
    await transport.send({ to: 'bob@example.com', subject: 'Hi', text: 'x' });

    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      auth: { user: 'u', pass: 'p' },
    });
    expect(sendMail).toHaveBeenCalledWith({
      from: 'WalSign <no-reply@example.com>',
      to: 'bob@example.com',
      subject: 'Hi',
      text: 'x',
    });
  });
});

describe('createMailTransport', () => {
  it('logs instead of sending in dry-run mode', async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const transport = createMailTransport({ dryRun: true } as never, logger);
    await transport.send({ to: 'bob@example.com', subject: 'Hi', text: 'x' });
    expect(logger.info).toHaveBeenCalledWith('[dry run] To: bob@example.com | Hi');
  });
});
