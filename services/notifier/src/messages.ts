export type NotificationKind = 'invited' | 'your-turn' | 'deadline-approaching' | 'completed';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface MessageContext {
  kind: NotificationKind;
  title: string;
  link: string;
  deadlineMs?: number | null;
}

const formatDeadline = (ms: number) => new Date(ms).toUTCString();

/** Plain-text email content for a notification */
export function renderMessage(to: string, context: MessageContext): EmailMessage {
  const { title, link, deadlineMs } = context;
  const deadlineLine = deadlineMs ? `\nPlease sign before ${formatDeadline(deadlineMs)}.` : '';
  switch (context.kind) {
    case 'invited':
      return {
        to,
        subject: `You have been asked to sign "${title}"`,
        text: `You were added as a signer of "${title}" on WalSign.${deadlineLine}\n\nOpen the document: ${link}\n`,
      };
    case 'your-turn':
      return {
        to,
        subject: `Your turn to sign "${title}"`,
        text: `The previous signers have signed "${title}". It is now your turn.${deadlineLine}\n\nSign the document: ${link}\n`,
      };
    case 'deadline-approaching':
      return {
        to,
        subject: `Reminder: "${title}" is due ${deadlineMs ? formatDeadline(deadlineMs) : 'soon'}`,
        text: `"${title}" is still waiting for your signature and the signing deadline is approaching.${deadlineLine}\n\nSign the document: ${link}\n`,
      };
    case 'completed':
      return {
        to,
        subject: `"${title}" has been signed by everyone`,
        text: `All signers have signed "${title}". You can download the completion certificate from the document page.\n\nOpen the document: ${link}\n`,
      };
  }
}
