import { truncateAddress } from '../../utils/addressUtils';

export function AddressDisplay({ address }: { address: string }) {
  const truncated = truncateAddress(address);
  const copy = async () => navigator.clipboard.writeText(address);
  return (
    <span className="inline-flex items-center gap-2 font-mono text-sm">
      {truncated}
      <button onClick={copy} className="text-primary hover:underline">Copy</button>
    </span>
  );
}


