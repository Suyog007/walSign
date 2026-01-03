import React from 'react';
import { DocumentSummary } from '../services/registryService';
import { formatAddress } from '../utils/addressUtils';
import { CheckCircle, Circle, Users, Calendar, FileText } from 'lucide-react';
import { Button } from './ui/Button';

interface DocumentCardProps {
  document: DocumentSummary;
  isCreator: boolean;
  onViewDocument: (documentId: string) => void;
  onAddParticipants: (documentId: string) => void;
  onShareLink: (documentId: string) => void;
}

const DocumentCard: React.FC<DocumentCardProps> = ({
  document,
  isCreator,
  onViewDocument,
  onAddParticipants,
  onShareLink,
}) => {
  // Calculate actual status based on signatures vs unique authorized signers
  const getActualStatus = () => {
    const uniqueSigners = new Set(document.authorizedSigners).size;
    const signatureCount = document.signatures.length;
    
    if (signatureCount === 0) {
      return 0; // Pending
    } else if (signatureCount < uniqueSigners) {
      return 1; // Partial
    } else {
      return 2; // Complete
    }
  };

  const getStatusInfo = () => {
    // Use calculated status instead of blockchain status (to handle duplicate signers)
    const actualStatus = getActualStatus();
    
    switch (actualStatus) {
      case 0:
        return {
          label: 'Pending',
          color: 'bg-red-100 text-red-800 border-red-300',
          bgColor: 'bg-red-50',
        };
      case 1:
        return {
          label: 'Partial',
          color: 'bg-yellow-100 text-yellow-800 border-yellow-300',
          bgColor: 'bg-yellow-50',
        };
      case 2:
        return {
          label: 'Complete',
          color: 'bg-green-100 text-green-800 border-green-300',
          bgColor: 'bg-green-50',
        };
      default:
        return {
          label: 'Unknown',
          color: 'bg-gray-100 text-gray-800 border-gray-300',
          bgColor: 'bg-gray-50',
        };
    }
  };

  const statusInfo = getStatusInfo();
  const signedCount = document.signatures.length;
  // Use unique signers count to handle duplicates
  const uniqueSignersCount = new Set(document.authorizedSigners).size;
  const totalSigners = uniqueSignersCount;
  const progress = totalSigners > 0 ? (signedCount / totalSigners) * 100 : 0;

  // Debug logging for duplicate signers
  if (document.authorizedSigners.length !== uniqueSignersCount) {
    console.warn('Duplicate signers detected:', {
      documentId: document.documentId,
      totalAuthSigners: document.authorizedSigners.length,
      uniqueSigners: uniqueSignersCount,
      authorizedSigners: document.authorizedSigners,
      duplicates: document.authorizedSigners.length - uniqueSignersCount,
    });
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const hasUserSigned = (signerAddress: string) => {
    return document.signatures.some(sig => sig.signer === signerAddress);
  };

  return (
    <div className={`border-2 rounded-lg p-6 hover:shadow-lg transition-all ${statusInfo.bgColor} border-gray-200`}>
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-900 truncate">
              {document.title}
            </h3>
          </div>
          {document.description && (
            <p className="text-sm text-gray-600 line-clamp-2 mb-2">
              {document.description}
            </p>
          )}
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-medium border ${statusInfo.color}`}>
          {statusInfo.label}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-gray-700">
            Signatures: {signedCount}/{totalSigners}
          </span>
          <span className="text-xs text-gray-500">
            {Math.round(progress)}%
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${
              document.status === 2
                ? 'bg-green-500'
                : document.status === 1
                ? 'bg-yellow-500'
                : 'bg-gray-400'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Signers List */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <Users className="w-4 h-4 text-gray-600" />
          <span className="text-sm font-medium text-gray-700">Authorized Signers:</span>
        </div>
        <div className="space-y-1">
          {document.authorizedSigners.map((signer) => (
            <div key={signer} className="flex items-center gap-2 text-sm">
              {hasUserSigned(signer) ? (
                <CheckCircle className="w-4 h-4 text-green-600" />
              ) : (
                <Circle className="w-4 h-4 text-gray-400" />
              )}
              <span className={hasUserSigned(signer) ? 'text-green-700' : 'text-gray-600'}>
                {formatAddress(signer)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Metadata */}
      <div className="flex items-center gap-2 mb-4 text-xs text-gray-500">
        <Calendar className="w-4 h-4" />
        <span>Created {formatDate(document.createdAt)}</span>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <Button
          onClick={() => onViewDocument(document.documentId)}
          className="flex-1"
          variant="primary"
        >
          View Document
        </Button>
        {isCreator && (
          <Button
            onClick={() => onAddParticipants(document.documentId)}
            variant="outline"
          >
            Add Participants
          </Button>
        )}
        <Button
          onClick={() => onShareLink(document.documentId)}
          variant="outline"
        >
          Share
        </Button>
      </div>
    </div>
  );
};

export default DocumentCard;

