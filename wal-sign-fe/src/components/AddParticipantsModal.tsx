import React, { useState } from 'react';
import { X, UserPlus, CheckCircle, Loader } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { DocumentSummary } from '../services/registryService';
import { formatAddress } from '../utils/addressUtils';
import { isValidSuiAddress } from '@mysten/sui/utils';
import { PACKAGE_ID, REGISTRY_OBJECT_ID } from '../config/seal.config';
import { useSignAndExecuteTransactionBlock } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';

interface AddParticipantsModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: DocumentSummary;
  onSuccess: () => void;
}

const AddParticipantsModal: React.FC<AddParticipantsModalProps> = ({
  isOpen,
  onClose,
  document,
  onSuccess,
}) => {
  console.log('=== ADD PARTICIPANTS MODAL RENDERED ===');
  console.log('isOpen:', isOpen);
  console.log('document:', document);
  console.log('authorizedSigners:', document.authorizedSigners);
  console.log('authorizedSigners length:', document.authorizedSigners?.length);
  console.log('signatures:', document.signatures);
  console.log('signatures length:', document.signatures?.length);
  
  const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransactionBlock();
  const [newSignerAddress, setNewSignerAddress] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const validateAddress = (address: string): boolean => {
    if (!address) {
      setError('Please enter an address');
      return false;
    }

    // Normalize address
    const normalizedAddress = address.startsWith('0x') ? address : `0x${address}`;

    if (!isValidSuiAddress(normalizedAddress)) {
      setError('Invalid Sui address format');
      return false;
    }

    if (document.authorizedSigners.includes(normalizedAddress)) {
      setError('This address is already an authorized signer');
      return false;
    }

    return true;
  };

  const handleAddParticipant = async () => {
    console.log('=== HANDLE ADD PARTICIPANT CALLED ===');
    setError(null);
    setSuccess(null);

    const normalizedAddress = newSignerAddress.startsWith('0x')
      ? newSignerAddress
      : `0x${newSignerAddress}`;

    console.log('Normalized address:', normalizedAddress);
    console.log('Document ID:', document.documentId);
    console.log('Package ID:', PACKAGE_ID);
    console.log('Registry ID:', REGISTRY_OBJECT_ID);

    if (!validateAddress(normalizedAddress)) {
      console.error('Address validation failed');
      return;
    }

    console.log('Address validation passed');
    setIsLoading(true);

    try {
      // Step 1: Add authorized signer using connected wallet
      console.log('=== STEP 1: Adding authorized signer ===');
      
      const addSignerTx = new Transaction();
      addSignerTx.moveCall({
        target: `${PACKAGE_ID}::wal_sign::issue_signer_capability`,
        arguments: [
        addSignerTx.object(REGISTRY_OBJECT_ID),
          addSignerTx.object(document.documentId),
          addSignerTx.pure.address(normalizedAddress),
        ],
      });

      await new Promise<void>((resolve, reject) => {
        signAndExecuteTransaction(
          {
            transactionBlock: addSignerTx as any,
            options: {
              showEffects: true,
              showEvents: true,
            },
          },
          {
            onSuccess: (result: any) => {
              console.log('Signer added, tx:', result.digest);
              resolve();
            },
            onError: (error: any) => {
              console.error('Failed to add signer:', error);
              reject(error);
            },
          }
        );
      });

      setSuccess(`Successfully added ${formatAddress(normalizedAddress)} as a signer!`);
      setNewSignerAddress('');

      // Call success callback after a short delay
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 2000);
    } catch (err: any) {
      console.error('Error adding participant:', err);
      setError(err.message || 'Failed to add participant. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setNewSignerAddress('');
      setError(null);
      setSuccess(null);
      onClose();
    }
  };

  return (
    <Modal open={isOpen} onClose={handleClose} title="Add Participants">
      <div className="space-y-6">
        {/* Document Info */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-2">{document.title}</h4>
          <p className="text-sm text-gray-600">
            Current signers: {document.authorizedSigners.length}
          </p>
        </div>

        {/* Current Signers List */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-3">Current Authorized Signers:</h4>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {document.authorizedSigners.map((signer) => {
              const hasSigned = document.signatures.some(sig => sig.signer === signer);
              return (
                <div
                  key={signer}
                  className="flex items-center justify-between bg-white border border-gray-200 rounded-lg p-3"
                >
                  <span className="text-sm text-gray-700 font-mono">
                    {formatAddress(signer)}
                  </span>
                  {hasSigned && (
                    <div className="flex items-center gap-1 text-green-600">
                      <CheckCircle className="w-4 h-4" />
                      <span className="text-xs">Signed</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Add New Signer */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-3">Add New Signer:</h4>
          <div className="space-y-3">
            <Input
              label="Sui Wallet Address"
              placeholder="0x..."
              value={newSignerAddress}
              onChange={(value) => {
                setNewSignerAddress(value);
                setError(null);
              }}
              disabled={isLoading}
              error={error || undefined}
            />

            {success && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-green-800">{success}</p>
              </div>
            )}

            <div className="flex gap-3">
              <Button
                onClick={handleAddParticipant}
                disabled={isLoading || !newSignerAddress}
                className="flex-1"
                variant="primary"
              >
                {isLoading ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin mr-2" />
                    Adding...
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4 mr-2" />
                    Add Participant
                  </>
                )}
              </Button>
              <Button onClick={handleClose} disabled={isLoading} variant="outline">
                Cancel
              </Button>
            </div>
          </div>
        </div>

        {/* Helper Text */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-xs text-blue-800">
            <strong>Note:</strong> Adding a participant will create two blockchain transactions:
            one to authorize them and another to issue their signing capability.
          </p>
        </div>
      </div>
    </Modal>
  );
};

export default AddParticipantsModal;

