import nodemailer from 'nodemailer';
import { NotifierConfig } from './config.js';
import { EmailMessage } from './messages.js';
import { Logger, MailTransport } from './notifier.js';

/** SMTP transport, or a logging transport when MAIL_DRY_RUN=true */
export function createMailTransport(config: NotifierConfig, logger: Logger): MailTransport {
  if (config.dryRun || !config.smtp) {
    return {
      async send(message: EmailMessage) {
        logger.info(`[dry run] To: ${message.to} | ${message.subject}`);
      },
    };
  }

  const { host, port, secure, user, pass } = config.smtp;
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user ? { user, pass } : undefined,
  });
  return {
    async send(message: EmailMessage) {
      await transporter.sendMail({ from: config.mailFrom, ...message });
    },
  };
}
