import { ArrowDown, ArrowUp } from 'lucide-react';
import { formatAddress } from '../utils/addressUtils';

/** Sequential-order toggle and deadline picker shared by upload and participant management */
export function SigningRulesFields({
  sequential,
  onSequentialChange,
  sequentialLockedReason,
  deadline,
  onDeadlineChange,
  deadlineError,
}: {
  sequential: boolean;
  onSequentialChange: (sequential: boolean) => void;
  /** When set, the order can no longer be changed and this explains why */
  sequentialLockedReason?: string;
  /** `datetime-local` value, empty for no deadline */
  deadline: string;
  onDeadlineChange: (value: string) => void;
  deadlineError?: string | null;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={sequential}
          onChange={(e) => onSequentialChange(e.target.checked)}
          disabled={!!sequentialLockedReason}
          className="mt-0.5"
        />
        <span>
          <span className="font-medium">Sign in order</span>
          <span className="block text-xs text-gray-500">
            {sequentialLockedReason ?? 'Each signer can sign only after the previous one has signed.'}
          </span>
        </span>
      </label>
      <div className="space-y-1">
        <label htmlFor="signing-deadline" className="text-sm font-medium">
          Deadline <span className="font-normal text-gray-500">(optional)</span>
        </label>
        <div className="flex gap-2">
          <input
            id="signing-deadline"
            type="datetime-local"
            value={deadline}
            onChange={(e) => onDeadlineChange(e.target.value)}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 ${
              deadlineError ? 'border-error focus:ring-error/30' : 'border-gray-300 focus:ring-primary/30'
            }`}
          />
          {deadline && (
            <button
              type="button"
              onClick={() => onDeadlineChange('')}
              className="rounded-lg border border-gray-300 px-3 text-xs hover:bg-white"
            >
              No deadline
            </button>
          )}
        </div>
        {deadlineError && <p className="text-xs text-error">{deadlineError}</p>}
      </div>
    </div>
  );
}

/** Ordered signer list with move up/down controls */
export function OrderedSignerList({
  signers,
  onChange,
  showOrder,
}: {
  signers: string[];
  onChange: (signers: string[]) => void;
  showOrder: boolean;
}) {
  const move = (index: number, delta: number) => {
    const next = [...signers];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    onChange(next);
  };

  return (
    <ol className="space-y-1" aria-label="Signers">
      {signers.map((address, index) => (
        <li
          key={address}
          className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-mono"
          title={address}
        >
          {showOrder && <span className="w-5 text-gray-400">{index + 1}.</span>}
          <span className="flex-1 text-gray-700">{formatAddress(address)}</span>
          {showOrder && (
            <>
              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                aria-label={`Move ${formatAddress(address)} up`}
                className="rounded p-0.5 hover:bg-gray-100 disabled:opacity-30"
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === signers.length - 1}
                aria-label={`Move ${formatAddress(address)} down`}
                className="rounded p-0.5 hover:bg-gray-100 disabled:opacity-30"
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => onChange(signers.filter((s) => s !== address))}
            aria-label={`Remove ${formatAddress(address)}`}
            className="rounded p-0.5 text-red-500 hover:bg-red-50 hover:text-red-700"
          >
            ×
          </button>
        </li>
      ))}
    </ol>
  );
}
