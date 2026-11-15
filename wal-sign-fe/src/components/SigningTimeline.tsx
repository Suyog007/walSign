import { AlertTriangle, CheckCircle, Clock, FileText, Hourglass, UserCog, XCircle } from 'lucide-react';
import { DocumentSummary } from '../services/registryService';
import {
  describeDeadline,
  DocumentWorkflow,
  getDocumentPhase,
  getSignerSteps,
  SignerStep,
} from '../services/workflowService';
import { formatAddress } from '../utils/addressUtils';

const STATE_LABELS: Record<SignerStep['state'], string> = {
  signed: 'Signed',
  declined: 'Declined',
  'up-next': 'Up next',
  waiting: 'Waiting',
  pending: 'Awaiting signature',
};

function StepIcon({ state }: { state: SignerStep['state'] }) {
  switch (state) {
    case 'signed':
      return <CheckCircle className="w-5 h-5 text-green-600" />;
    case 'declined':
      return <XCircle className="w-5 h-5 text-red-600" />;
    case 'up-next':
      return <Hourglass className="w-5 h-5 text-primary" />;
    default:
      return <Clock className="w-5 h-5 text-gray-400" />;
  }
}

export function SigningTimeline({
  document,
  workflow,
  now,
  currentAddress,
  canManage,
  onReassign,
}: {
  document: DocumentSummary;
  workflow: DocumentWorkflow;
  now: number;
  currentAddress?: string;
  /** Show reassign controls (document creator only) */
  canManage: boolean;
  onReassign: (signer: string) => void;
}) {
  const steps = getSignerSteps(document, workflow);
  const phase = getDocumentPhase(document, workflow, now);
  const completedAt = phase === 'completed' ? Math.max(0, ...document.signatures.map((s) => s.signedAt)) : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">
          {workflow.sequential ? 'Sequential signing' : 'Any order'}
        </span>
        {workflow.deadlineMs !== null && (
          <span
            className={`rounded-full px-2 py-0.5 ${phase === 'expired' ? 'bg-red-100 text-red-700' : 'bg-blue-50 text-blue-700'}`}
            title={new Date(workflow.deadlineMs).toLocaleString()}
          >
            {phase === 'completed'
              ? `Deadline ${new Date(workflow.deadlineMs).toLocaleDateString()}`
              : describeDeadline(workflow.deadlineMs, now)}
          </span>
        )}
      </div>

      {phase === 'expired' && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          The signing deadline has passed. The creator can extend it to reopen signing.
        </div>
      )}

      <ol className="relative space-y-4 border-l border-gray-200 pl-5" aria-label="Signing timeline">
        <li className="relative">
          <span className="absolute -left-[30px] flex h-5 w-5 items-center justify-center rounded-full bg-white">
            <FileText className="w-4 h-4 text-gray-500" />
          </span>
          <p className="text-sm font-medium">Sent for signature</p>
          <p className="text-xs text-gray-500">{new Date(document.createdAt).toLocaleString()}</p>
        </li>

        {steps.map((step) => (
          <li key={step.address} className="relative" data-state={step.state}>
            <span className="absolute -left-[30px] flex h-5 w-5 items-center justify-center rounded-full bg-white">
              <StepIcon state={step.state} />
            </span>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {workflow.sequential && <span className="text-gray-400 mr-1">#{step.position}</span>}
                  <span className="font-mono" title={step.address}>
                    {step.address === currentAddress ? 'You' : formatAddress(step.address)}
                  </span>
                </p>
                <p className="text-xs text-gray-500">
                  {STATE_LABELS[step.state]}
                  {step.signedAt !== undefined && ` · ${new Date(step.signedAt).toLocaleString()}`}
                  {step.decline && ` · ${new Date(step.decline.declinedAt).toLocaleString()}`}
                </p>
                {step.decline && (
                  <p className="mt-1 rounded bg-red-50 px-2 py-1 text-xs text-red-800 break-words">
                    “{step.decline.reason}”
                  </p>
                )}
              </div>
              {canManage && step.state !== 'signed' && phase !== 'completed' && (
                <button
                  onClick={() => onReassign(step.address)}
                  className="flex-shrink-0 inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
                  aria-label={`Reassign ${formatAddress(step.address)}`}
                >
                  <UserCog className="w-3 h-3" />
                  Reassign
                </button>
              )}
            </div>
          </li>
        ))}

        {completedAt !== null && (
          <li className="relative">
            <span className="absolute -left-[30px] flex h-5 w-5 items-center justify-center rounded-full bg-white">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </span>
            <p className="text-sm font-medium text-green-700">Completed</p>
            <p className="text-xs text-gray-500">{new Date(completedAt).toLocaleString()}</p>
          </li>
        )}
      </ol>
    </div>
  );
}
