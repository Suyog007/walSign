import { ReactNode, useState } from 'react';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { AlertCircle, Loader, Lock, MessageSquare, RefreshCw, Send, Unlock } from 'lucide-react';
import { Card, CardBody, CardHeader } from './ui/Card';
import { Button } from './ui/Button';
import { DocumentSummary } from '../services/registryService';
import { MAX_MESSAGE_LENGTH } from '../services/discussionService';
import { useDocumentThread } from '../hooks/useDocumentThread';
import { formatAddress } from '../utils/addressUtils';

export function DocumentThreadPanel({ document }: { document: DocumentSummary }) {
  const currentAccount = useCurrentAccount();
  const {
    messages,
    plaintexts,
    isParticipant,
    isLoading,
    isUnlocking,
    isUnlocked,
    isPosting,
    error,
    reload,
    unlock,
    post,
  } = useDocumentThread(document);
  const [draft, setDraft] = useState('');

  const participantCount = new Set([document.creator, ...document.authorizedSigners]).size;
  const draftLength = draft.trim().length;
  const canSend = !isPosting && draftLength > 0 && draftLength <= MAX_MESSAGE_LENGTH;

  const handleSend = async () => {
    if (await post(draft)) {
      setDraft('');
    }
  };

  const renderBody = () => {
    if (!currentAccount) {
      return <Notice>Connect your wallet to join the discussion.</Notice>;
    }
    if (!isParticipant) {
      return <Notice>Only the document's creator and signers can read this discussion.</Notice>;
    }
    if (isLoading) {
      return (
        <div className="flex items-center justify-center gap-2 py-8 text-gray-600">
          <Loader className="w-5 h-5 animate-spin" />
          <span>Loading discussion...</span>
        </div>
      );
    }
    if (messages.length === 0) {
      return (
        <div className="py-8 text-center text-sm text-gray-500">
          <MessageSquare className="w-10 h-10 mx-auto mb-2 text-gray-300" />
          No messages yet. Questions and comments you post here are encrypted for the participants only.
        </div>
      );
    }
    if (!isUnlocked) {
      return (
        <div className="py-6 text-center space-y-3">
          <Lock className="w-10 h-10 mx-auto text-gray-400" />
          <p className="text-sm text-gray-700">
            {messages.length} encrypted {messages.length === 1 ? 'message' : 'messages'}
          </p>
          <Button onClick={unlock} loading={isUnlocking} variant="primary">
            <Unlock className="w-4 h-4 mr-2" />
            Decrypt messages
          </Button>
          <p className="text-xs text-gray-500">Your wallet will ask you to sign a message to prove access.</p>
        </div>
      );
    }
    return (
      <ul className="space-y-3 max-h-96 overflow-y-auto pr-1" aria-label="Discussion messages">
        {messages.map((message) => {
          const isMine = message.sender === currentAccount.address;
          const text = plaintexts[message.index];
          return (
            <li
              key={message.index}
              className={`rounded-lg border p-3 ${isMine ? 'bg-primary/5 border-primary/20 ml-8' : 'bg-white border-gray-200 mr-8'}`}
            >
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                <span className="font-mono">{isMine ? 'You' : formatAddress(message.sender)}</span>
                <span>{new Date(message.postedAt).toLocaleString()}</span>
              </div>
              {text === undefined ? (
                <p className="text-sm italic text-gray-400">Encrypted</p>
              ) : text === null ? (
                <p className="text-sm italic text-red-500">This message could not be decrypted.</p>
              ) : (
                <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{text}</p>
              )}
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Discussion
          </h3>
          <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
            <Lock className="w-3 h-3" />
            End-to-end encrypted for {participantCount} participants
          </p>
        </div>
        {isParticipant && (
          <button
            onClick={reload}
            disabled={isLoading}
            aria-label="Refresh discussion"
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        )}
      </CardHeader>
      <CardBody className="space-y-4">
        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {renderBody()}

        {currentAccount && isParticipant && !isLoading && (
          <div className="space-y-2 border-t pt-4">
            <label htmlFor="thread-draft" className="sr-only">
              Message
            </label>
            <textarea
              id="thread-draft"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Write a message to the other participants..."
              rows={3}
              disabled={isPosting}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-gray-100"
            />
            <div className="flex items-center justify-between">
              <span className={`text-xs ${draftLength > MAX_MESSAGE_LENGTH ? 'text-red-600' : 'text-gray-500'}`}>
                {draftLength}/{MAX_MESSAGE_LENGTH}
              </span>
              <Button onClick={handleSend} disabled={!canSend} loading={isPosting} size="sm">
                <Send className="w-4 h-4 mr-2" />
                {isPosting ? 'Sending...' : 'Send'}
              </Button>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">{children}</div>;
}
