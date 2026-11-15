import { useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { MAX_DECLINE_REASON_BYTES } from '../services/workflowService';

export function DeclineDialog({
  open,
  onClose,
  onSubmit,
  pending,
  error,
}: {
  open: boolean;
  onClose: () => void;
  /** Resolves to true when the decline was recorded */
  onSubmit: (reason: string) => Promise<boolean>;
  pending: boolean;
  error: string | null;
}) {
  const [reason, setReason] = useState('');
  const length = new TextEncoder().encode(reason.trim()).length;

  const handleClose = () => {
    if (pending) return;
    setReason('');
    onClose();
  };

  const handleSubmit = async () => {
    if (await onSubmit(reason)) {
      setReason('');
      onClose();
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="Decline to sign">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          The creator and other participants will see your reason. Signing is paused for everyone until the creator
          reassigns your place or removes you.
        </p>
        <div className="space-y-1">
          <label htmlFor="decline-reason" className="text-sm font-medium">
            Reason
          </label>
          <textarea
            id="decline-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            disabled={pending}
            placeholder="e.g. The start date in section 2 is wrong"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          />
          <p className={`text-xs ${length > MAX_DECLINE_REASON_BYTES ? 'text-red-600' : 'text-gray-500'}`}>
            {length}/{MAX_DECLINE_REASON_BYTES}
          </p>
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleSubmit}
            loading={pending}
            disabled={!reason.trim() || length > MAX_DECLINE_REASON_BYTES}
          >
            Decline document
          </Button>
        </div>
      </div>
    </Modal>
  );
}
