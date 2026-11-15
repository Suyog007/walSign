import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { loadConfig } from './config.js';
import { ContactDirectory } from './contacts.js';
import { createMailTransport } from './mail.js';
import { Logger, Notifier } from './notifier.js';
import { FileStateStore } from './state.js';
import { SuiDocumentReader, SuiEventSource } from './sui.js';

const logger: Logger = {
  info: (message) => console.log(`${new Date().toISOString()} INFO  ${message}`),
  warn: (message) => console.warn(`${new Date().toISOString()} WARN  ${message}`),
  error: (message) => console.error(`${new Date().toISOString()} ERROR ${message}`),
};

async function main() {
  const config = loadConfig(process.env);
  const client = new SuiClient({ url: config.rpcUrl ?? getFullnodeUrl(config.network) });
  const contacts = await ContactDirectory.fromFile(config.contactsFile);

  const notifier = new Notifier({
    events: new SuiEventSource(client, config.packageId),
    documents: new SuiDocumentReader(client),
    contacts,
    mail: createMailTransport(config, logger),
    state: new FileStateStore(config.stateFile),
    appBaseUrl: config.appBaseUrl,
    deadlineWarningMs: config.deadlineWarningMs,
    logger,
  });

  logger.info(
    `Watching ${config.packageId} on ${config.network} for ${contacts.size} contact(s)${config.dryRun ? ' (dry run)' : ''}`,
  );

  let stopping = false;
  let timer: NodeJS.Timeout | undefined;
  const stop = () => {
    stopping = true;
    if (timer) clearTimeout(timer);
    logger.info('Shutting down');
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  const tick = async () => {
    try {
      const events = await notifier.poll();
      if (events > 0) logger.info(`Processed ${events} event(s)`);
      await notifier.checkDeadlines();
    } catch (err) {
      // Transient RPC failures: the cursor was not advanced, so the next tick retries
      logger.warn(`Poll failed: ${(err as Error).message}`);
    }
    if (!stopping) timer = setTimeout(tick, config.pollIntervalMs);
  };
  await tick();
}

main().catch((err) => {
  logger.error((err as Error).message);
  process.exit(1);
});
