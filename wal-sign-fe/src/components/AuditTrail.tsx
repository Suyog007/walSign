import {
  AlertCircle,
  CalendarClock,
  CheckCircle,
  ExternalLink,
  FilePlus,
  ListOrdered,
  Loader,
  MessageSquare,
  PenLine,
  RefreshCw,
  UserCog,
  XCircle,
} from 'lucide-react';
import { ReactNode } from 'react';
import { EXPLORER_URL } from '../config/seal.config';
import { AuditEntry, AuditEventKind } from '../services/auditService';
import { formatAddress } from '../utils/addressUtils';

const KINDS: Record<AuditEventKind, { label: string; icon: ReactNode }> = {
  created: { label: 'Document created', icon: <FilePlus className="w-4 h-4 text-gray-600" /> },
  'order-set': { label: 'Signing order set', icon: <ListOrdered className="w-4 h-4 text-gray-600" /> },
  'deadline-set': { label: 'Deadline set', icon: <CalendarClock className="w-4 h-4 text-blue-600" /> },
  'deadline-cleared': { label: 'Deadline removed', icon: <CalendarClock className="w-4 h-4 text-gray-500" /> },
  signed: { label: 'Signed', icon: <PenLine className="w-4 h-4 text-green-600" /> },
  declined: { label: 'Declined', icon: <XCircle className="w-4 h-4 text-red-600" /> },
  reassigned: { label: 'Signer reassigned', icon: <UserCog className="w-4 h-4 text-amber-600" /> },
  'discussion-opened': { label: 'Discussion opened', icon: <MessageSquare className="w-4 h-4 text-gray-600" /> },
  completed: { label: 'Completed', icon: <CheckCircle className="w-4 h-4 text-green-700" /> },
};

function Digest({ digest }: { digest: string }) {
  const short = `${digest.slice(0, 8)}…${digest.slice(-4)}`;
  if (!EXPLORER_URL) {
    return (
      <span className="font-mono" title={digest}>
        {short}
      </span>
    );
  }
  return (
    <a
      href={`${EXPLORER_URL}/tx/${digest}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-0.5 font-mono text-primary hover:underline"
      title={digest}
    >
      {short}
      <ExternalLink className="w-3 h-3" />
    </a>
  );
}

export function AuditTrail({
  entries,
  isLoading,
  error,
  onRetry,
}: {
  entries: AuditEntry[];
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (isLoading && entries.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-600">
        <Loader className="w-4 h-4 animate-spin" />
        Loading audit trail...
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="flex items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
        <span className="flex items-center gap-2 text-sm text-red-800">
          <AlertCircle className="w-4 h-4" />
          {error}
        </span>
        <button onClick={onRetry} className="inline-flex items-center gap-1 text-xs text-red-800 hover:underline">
          <RefreshCw className="w-3 h-3" />
          Retry
        </button>
      </div>
    );
  }

  if (entries.length === 0) {
    return <p className="py-4 text-center text-sm text-gray-500">No on-chain activity found for this document yet.</p>;
  }

  return (
    <ol className="space-y-3" aria-label="Audit trail">
      {entries.map((entry) => {
        const kind = KINDS[entry.kind];
        return (
          <li key={`${entry.digest}-${entry.eventSeq}-${entry.kind}`} className="flex gap-3">
            <span className="mt-0.5 flex-shrink-0">{kind.icon}</span>
            <div className="min-w-0 flex-1 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-medium">
                  {kind.label}
                  {entry.subject && (
                    <span className="ml-1 font-mono font-normal text-gray-600" title={entry.subject}>
                      {formatAddress(entry.subject)}
                    </span>
                  )}
                </span>
                <span className="text-xs text-gray-500">{new Date(entry.timestampMs).toLocaleString()}</span>
              </div>
              {entry.detail && (
                <p className="text-xs text-gray-600 break-words">
                  {entry.kind === 'deadline-set' && entry.deadlineMs !== undefined
                    ? new Date(entry.deadlineMs).toLocaleString()
                    : entry.detail}
                </p>
              )}
              <p className="text-xs text-gray-500">
                by <span className="font-mono" title={entry.actor}>{formatAddress(entry.actor)}</span> · tx{' '}
                <Digest digest={entry.digest} />
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
