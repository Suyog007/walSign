import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const base = {
  WALSIGN_PACKAGE_ID: '0xabc',
  APP_BASE_URL: 'https://sign.example.com/',
  MAIL_FROM: 'WalSign <no-reply@example.com>',
  MAIL_DRY_RUN: 'true',
};

describe('loadConfig', () => {
  it('applies defaults', () => {
    expect(loadConfig(base)).toEqual({
      network: 'testnet',
      rpcUrl: undefined,
      packageId: '0xabc',
      appBaseUrl: 'https://sign.example.com',
      contactsFile: './contacts.json',
      stateFile: './notifier-state.json',
      pollIntervalMs: 15_000,
      deadlineWarningMs: 24 * 3_600_000,
      mailFrom: 'WalSign <no-reply@example.com>',
      dryRun: true,
      smtp: undefined,
    });
  });

  it('reads SMTP settings when not in dry-run mode', () => {
    const config = loadConfig({
      ...base,
      MAIL_DRY_RUN: 'false',
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '465',
      SMTP_SECURE: 'true',
      SMTP_USER: 'user',
      SMTP_PASS: 'secret',
      POLL_INTERVAL_SECONDS: '5',
      DEADLINE_WARNING_HOURS: '2',
    });
    expect(config.smtp).toEqual({ host: 'smtp.example.com', port: 465, secure: true, user: 'user', pass: 'secret' });
    expect(config.pollIntervalMs).toBe(5000);
    expect(config.deadlineWarningMs).toBe(2 * 3_600_000);
  });

  it('lists every problem at once', () => {
    expect(() =>
      loadConfig({ SUI_NETWORK: 'localnet', WALSIGN_PACKAGE_ID: 'abc', APP_BASE_URL: 'ftp://x', POLL_INTERVAL_SECONDS: '-1' }),
    ).toThrow(
      /SUI_NETWORK must be one of[\s\S]*WALSIGN_PACKAGE_ID must be[\s\S]*APP_BASE_URL must start[\s\S]*SMTP_HOST is required[\s\S]*POLL_INTERVAL_SECONDS must be[\s\S]*MAIL_FROM is required/,
    );
  });
});
