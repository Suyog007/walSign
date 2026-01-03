import { UploadDocument } from '../components/UploadDocument';

export function UploadPage() {
  return (
    <div className="space-y-8 animate-fade-in">
      <div className="text-center space-y-2">
        <h2 className="text-4xl font-bold text-white drop-shadow-lg">Upload Document</h2>
        <p className="text-white/80 text-lg">Upload Contracts, Agreements, and other documents to be signed.</p>
      </div>
      <UploadDocument />
    </div>
  );
}


