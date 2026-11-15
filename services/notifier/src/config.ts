export type SuiNetwork = 'testnet' | 'mainnet' | 'devnet';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
}

export interface NotifierConfig {
  network: SuiNetwork;
  rpcUrl?: string;
  packageId: string;
  appBaseUrl: string;
  contactsFile: string;
  stateFile: string;
  pollIntervalMs: number;
  deadlineWarningMs: number;
  mailFrom: string;
  dryRun: boolean;
  smtp?: SmtpConfig;
}

const NETWORKS: SuiNetwork[] = ['testnet', 'mainnet', 'devnet'];

/** Read and validate configuration from environment variables */
export function loadConfig(env: Record<string, string | undefined>): NotifierConfig {
  const errors: string[] = [];
  const value = (key: string) => env[key]?.trim() || undefined;
  const required = (key: string) => {
    const v = value(key);
    if (!v) errors.push(`${key} is required`);
    return v ?? '';
  };
  const positiveNumber = (key: string, fallback: number) => {
    const raw = value(key);
    if (raw === undefined) return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) errors.push(`${key} must be a positive number`);
    return n;
  };

  const network = (value('SUI_NETWORK') ?? 'testnet') as SuiNetwork;
  if (!NETWORKS.includes(network)) errors.push(`SUI_NETWORK must be one of ${NETWORKS.join(', ')}`);

  const packageId = required('WALSIGN_PACKAGE_ID');
  if (packageId && !/^0x[0-9a-fA-F]{1,64}$/.test(packageId)) errors.push('WALSIGN_PACKAGE_ID must be a 0x-prefixed object ID');

  const appBaseUrl = required('APP_BASE_URL').replace(/\/+$/, '');
  if (appBaseUrl && !/^https?:\/\//.test(appBaseUrl)) errors.push('APP_BASE_URL must start with http:// or https://');

  const dryRun = value('MAIL_DRY_RUN') === 'true';
  let smtp: SmtpConfig | undefined;
  if (!dryRun) {
    smtp = {
      host: required('SMTP_HOST'),
      port: positiveNumber('SMTP_PORT', 587),
      secure: value('SMTP_SECURE') === 'true',
      user: value('SMTP_USER'),
      pass: value('SMTP_PASS'),
    };
  }

  const config: NotifierConfig = {
    network,
    rpcUrl: value('SUI_RPC_URL'),
    packageId,
    appBaseUrl,
    contactsFile: value('CONTACTS_FILE') ?? './contacts.json',
    stateFile: value('STATE_FILE') ?? './notifier-state.json',
    pollIntervalMs: positiveNumber('POLL_INTERVAL_SECONDS', 15) * 1000,
    deadlineWarningMs: positiveNumber('DEADLINE_WARNING_HOURS', 24) * 3_600_000,
    mailFrom: required('MAIL_FROM'),
    dryRun,
    smtp,
  };

  if (errors.length > 0) {
    throw new Error(`Invalid configuration:\n  - ${errors.join('\n  - ')}`);
  }
  return config;
}
