import { useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { formatAddress } from '../utils/addressUtils';

export function ReassignDialog({
  from,
  onClose,
  onSubmit,
  pending,
  error,
}: {
  /** Signer being replaced; the dialog is open while set */
  from: string | null;
  onClose: () => void;
  /** Resolves to true when the reassignment was recorded */
  onSubmit: (from: string, to: string) => Promise<boolean>;
  pending: boolean;
  error: string | null;
}) {
  const [to, setTo] = useState('');

  const handleClose = () => {
    if (pending) return;
    setTo('');
    onClose();
  };

  const handleSubmit = async () => {
    if (from && (await onSubmit(from, to.trim()))) {
      setTo('');
      onClose();
    }
  };

  return (
    <Modal open={from !== null} onClose={handleClose} title="Reassign signer">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          The new signer takes over <span className="font-mono">{from ? formatAddress(from) : ''}</span>'s place in
          the signing order and receives access to the document. The current signer loses access.
        </p>
        <Input
          label="New signer address"
          placeholder="0x..."
          value={to}
          onChange={setTo}
          disabled={pending}
          error={error ?? undefined}
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={pending} disabled={!to.trim()}>
            Reassign
          </Button>
        </div>
      </div>
    </Modal>
  );
}
