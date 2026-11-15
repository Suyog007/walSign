import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, Loader, Send, XCircle } from 'lucide-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { SigningRulesFields } from './SigningRulesFields';
import { useTemplateSend } from '../hooks/useTemplateSend';
import { MAX_DOCUMENTS_PER_SEND } from '../services/bulkSendService';
import { DocumentTemplate, parseRecipientRows, stampSignatureFields } from '../services/templateService';
import { parseDeadlineInput, WorkflowSettings } from '../services/workflowService';
import { formatAddress } from '../utils/addressUtils';

type Mode = 'single' | 'bulk';

const STAGE_LABELS = {
  creating: 'Creating documents (approve in your wallet)...',
  uploading: 'Encrypting and uploading',
  finalizing: 'Recording files and signing rules (approve in your wallet)...',
};

/** Create one document, or one per recipient row, from a decrypted template */
export function TemplateSendPanel({ template, pdf }: { template: DocumentTemplate; pdf: Uint8Array }) {
  const { send, progress, sent, failed, error } = useTemplateSend();
  const [mode, setMode] = useState<Mode>('single');
  const [title, setTitle] = useState(template.name);
  const [single, setSingle] = useState<string[]>(() => template.roles.map(() => ''));
  const [bulkText, setBulkText] = useState('');
  const [sequential, setSequential] = useState(template.sequential);
  const [deadline, setDeadline] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const parsed = useMemo(
    () =>
      mode === 'single'
        ? parseRecipientRows(single.join(','), template.roles.length)
        : parseRecipientRows(bulkText, template.roles.length),
    [mode, single, bulkText, template.roles.length],
  );
  const busy = ['creating', 'uploading', 'finalizing'].includes(progress.stage);

  const handleSend = async () => {
    setFormError(null);
    if (parsed.errors.length > 0 || parsed.rows.length === 0) {
      const first = parsed.errors[0];
      setFormError(
        first ? (mode === 'single' ? first.replace(/^Line \d+: /, '') : first) : 'Add at least one recipient',
      );
      return;
    }
    if (parsed.rows.length > MAX_DOCUMENTS_PER_SEND) {
      setFormError(`Send at most ${MAX_DOCUMENTS_PER_SEND} documents at a time`);
      return;
    }
    const workflow: WorkflowSettings = {};
    if (sequential) workflow.sequential = true;
    if (deadline) {
      const result = parseDeadlineInput(deadline, Date.now());
      if ('error' in result) {
        setFormError(result.error);
        return;
      }
      workflow.deadlineMs = result.deadlineMs;
    }
    const stamped = await stampSignatureFields(pdf, template.fields, template.roles);
    await send({ pdf: stamped, title, rows: parsed.rows, workflow });
  };

  if (progress.stage === 'complete') {
    return (
      <div className="space-y-3" role="status">
        <p className="flex items-center gap-2 font-medium text-green-700">
          <CheckCircle className="h-5 w-5" />
          {sent.length} document{sent.length === 1 ? '' : 's'} sent
        </p>
        <ul className="space-y-1 text-sm">
          {sent.map((doc) => (
            <li key={doc.documentId}>
              <Link to={`/sign/${doc.documentId}`} className="text-primary hover:underline">
                {doc.title}
              </Link>{' '}
              <span className="text-gray-500">→ {doc.signers.map(formatAddress).join(', ')}</span>
            </li>
          ))}
        </ul>
        {failed.length > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <p className="font-medium">{failed.length} could not be uploaded and were not sent:</p>
            {failed.map((doc) => (
              <p key={doc.title}>
                {doc.signers.join(', ')}: {doc.error}
              </p>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Input label="Document title" value={title} onChange={setTitle} disabled={busy} />

      <div className="flex gap-2" role="tablist">
        {(['single', 'bulk'] as const).map((value) => (
          <button
            key={value}
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            disabled={busy}
            className={`rounded-lg px-3 py-1.5 text-sm ${mode === value ? 'bg-primary text-white' : 'bg-gray-100'}`}
          >
            {value === 'single' ? 'One document' : 'Bulk send'}
          </button>
        ))}
      </div>

      {mode === 'single' ? (
        <div className="space-y-2">
          {template.roles.map((role, index) => (
            <Input
              key={role}
              label={role}
              placeholder="0x..."
              value={single[index]}
              onChange={(value) => setSingle((prev) => prev.map((v, i) => (i === index ? value.trim() : v)))}
              disabled={busy}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          <label htmlFor="bulk-recipients" className="text-sm font-medium">
            Recipients: one document per line, addresses for {template.roles.join(', ')}
          </label>
          <textarea
            id="bulk-recipients"
            rows={6}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            disabled={busy}
            placeholder={template.roles.map(() => '0x...').join(', ')}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs"
          />
          <p className="text-xs text-gray-500">
            {parsed.rows.length} document{parsed.rows.length === 1 ? '' : 's'} ready
            {parsed.errors.length > 0 && ` · ${parsed.errors.length} line(s) need fixing`}
          </p>
          {parsed.errors.slice(0, 5).map((message) => (
            <p key={message} className="text-xs text-red-700">
              {message}
            </p>
          ))}
        </div>
      )}

      <SigningRulesFields
        sequential={sequential}
        onSequentialChange={setSequential}
        deadline={deadline}
        onDeadlineChange={setDeadline}
      />

      {(formError || error) && (
        <p role="alert" className="flex items-center gap-2 text-sm text-red-700">
          <XCircle className="h-4 w-4" />
          {formError ?? error}
        </p>
      )}

      {busy ? (
        <p className="flex items-center gap-2 text-sm text-gray-700">
          <Loader className="h-4 w-4 animate-spin" />
          {STAGE_LABELS[progress.stage as keyof typeof STAGE_LABELS]}
          {progress.stage === 'uploading' && ` ${progress.done + 1}/${progress.total}`}
        </p>
      ) : (
        <Button onClick={handleSend} className="w-full">
          <Send className="mr-2 h-4 w-4" />
          {mode === 'single' ? 'Send document' : `Send ${parsed.rows.length} documents`}
        </Button>
      )}
    </div>
  );
}
