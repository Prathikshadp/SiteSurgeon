import { useParams, Link } from 'react-router-dom';
import { useIssue } from '../hooks/useIssue';
import StatusBadge from '../components/StatusBadge';
import SeverityBadge from '../components/SeverityBadge';
import LogViewer from '../components/LogViewer';

const STEP_ORDER = [
  'received', 'classifying', 'sandboxing', 'fixing', 'pr_opened', 'merged', 'notified', 'failed',
] as const;

export default function IssueDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { issue, loading, error } = useIssue(id);

  if (error) {
    return (
      <div className="max-w-2xl mx-auto">
        <p className="text-red-600 text-sm">Error: {error}</p>
        <Link to="/" className="text-gray-900 underline text-sm mt-2 block">← Back to report</Link>
      </div>
    );
  }

  if (loading && !issue) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-center">
          <div className="w-7 h-7 border-2 border-gray-900 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Loading issue...</p>
        </div>
      </div>
    );
  }

  if (!issue) return null;

  const currentStepIndex = STEP_ORDER.indexOf(issue.status as typeof STEP_ORDER[number]);
  const terminalOk = issue.status === 'merged' || issue.status === 'notified';
  const terminalFail = issue.status === 'failed';

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link to="/dashboard" className="text-gray-500 hover:text-gray-900 text-xs transition-colors">
            ← Dashboard
          </Link>
          <h1 className="text-xl font-bold text-gray-900 mt-1 tracking-tight">{issue.title}</h1>
          <p className="text-xs text-gray-400 mt-0.5 font-mono">ID: {issue.id}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <SeverityBadge severity={issue.severity} />
          <StatusBadge status={issue.status} />
          {issue.aiDecision && (
            <span className={`badge ${issue.aiDecision === 'AUTOMATED' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700'
              }`}>
              {issue.aiDecision === 'AUTOMATED' ? 'Automated' : 'Manual Review'}
            </span>
          )}
        </div>
      </div>

      {/* Progress Stepper */}
      {!terminalFail && (() => {
        const isManualPath = issue.aiDecision === 'MANUAL';
        const steps = isManualPath
          ? (['received', 'classifying', 'notified'] as const)
          : (['received', 'classifying', 'sandboxing', 'fixing', 'pr_opened', 'merged'] as const);

        return (
          <div className="card">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-5">
              Pipeline Progress {isManualPath && <span className="normal-case text-gray-400 font-normal">— Manual Review Path</span>}
            </h2>
            <div className="flex items-center overflow-x-auto pb-1">
              {steps.map((step, idx) => {
                const stepIdx = STEP_ORDER.indexOf(step);
                const isLast = idx === steps.length - 1;
                // Mark last step as done (not pulsing) when in a terminal state
                const done = currentStepIndex > stepIdx || (isLast && terminalOk && currentStepIndex === stepIdx);
                const active = currentStepIndex === stepIdx && !done;
                return (
                  <div key={step} className="flex items-center">
                    <div className="flex flex-col items-center min-w-[68px]">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${done ? 'bg-gray-900 text-white' :
                        active ? 'bg-gray-900 text-white ring-4 ring-gray-200 animate-pulse' :
                          'bg-gray-100 text-gray-400'
                        }`}>
                        {done ? '✓' : idx + 1}
                      </div>
                      <span className={`text-[11px] mt-1.5 capitalize font-medium ${active ? 'text-gray-900' : done ? 'text-gray-600' : 'text-gray-400'
                        }`}>
                        {step.replace('_', ' ')}
                      </span>
                    </div>
                    {!isLast && (
                      <div className={`h-px w-6 mx-1 mb-4 ${done ? 'bg-gray-900' : 'bg-gray-200'}`} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Terminal – success */}
      {terminalOk && (
        <div className={`rounded-xl p-5 border ${issue.status === 'merged'
          ? 'bg-green-50 border-green-200'
          : 'bg-orange-50 border-orange-200'
          }`}>
          {issue.status === 'merged' ? (
            <>
              <p className="text-green-800 font-semibold text-sm mb-1">Fix merged automatically</p>
              <p className="text-green-700 text-xs">The AI successfully fixed the bug and merged the PR.</p>
              {issue.prUrl && (
                <a href={issue.prUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-block mt-3 text-sm text-gray-900 underline font-medium">
                  View merged PR →
                </a>
              )}
            </>
          ) : (
            <>
              <p className="text-orange-800 font-semibold text-sm mb-1">Admin notified</p>
              <p className="text-orange-700 text-xs">
                The AI classified this issue as requiring manual review. An email has been sent.
              </p>
            </>
          )}
        </div>
      )}

      {/* Terminal – fail */}
      {terminalFail && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5">
          <p className="text-red-800 font-semibold text-sm mb-1">Pipeline failed</p>
          <p className="text-red-600 text-xs">An unexpected error occurred. Check backend logs for details.</p>
        </div>
      )}

      {/* Details grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Issue Details</h3>
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-gray-400 text-xs">Repository</span>
              <p className="mt-0.5">
                <a href={issue.repoUrl} target="_blank" rel="noopener noreferrer"
                  className="text-gray-900 hover:underline break-all text-xs font-mono">
                  {issue.repoUrl}
                </a>
              </p>
            </div>
            <div>
              <span className="text-gray-400 text-xs">Reported</span>
              <p className="text-gray-700 text-xs mt-0.5">{new Date(issue.createdAt).toLocaleString()}</p>
            </div>
            {issue.branchName && (
              <div>
                <span className="text-gray-400 text-xs">Branch</span>
                <p className="mt-0.5"><code className="text-xs font-mono text-gray-800 bg-gray-100 px-1.5 py-0.5 rounded">{issue.branchName}</code></p>
              </div>
            )}
            {issue.prUrl && (
              <div>
                <span className="text-gray-400 text-xs">Pull Request</span>
                <p className="mt-0.5">
                  <a href={issue.prUrl} target="_blank" rel="noopener noreferrer"
                    className="text-gray-900 hover:underline text-xs font-medium">
                    View Pull Request →
                  </a>
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">AI Analysis</h3>
          {issue.aiDecision ? (
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-gray-400 text-xs">Decision</span>
                <p className="text-gray-900 font-semibold text-sm mt-0.5">{issue.aiDecision}</p>
              </div>
              {issue.aiReason && (
                <div>
                  <span className="text-gray-400 text-xs">Reason</span>
                  <p className="text-gray-700 text-xs mt-1 leading-relaxed">{issue.aiReason}</p>
                </div>
              )}
              {issue.sandboxId && (
                <div>
                  <span className="text-gray-400 text-xs">Sandbox ID</span>
                  <p className="mt-0.5"><code className="text-xs font-mono text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded">{issue.sandboxId}</code></p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-gray-400 text-sm">Awaiting classification...</p>
          )}
        </div>
      </div>

      {/* Description */}
      <div className="card">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Description</h3>
        <p className="text-gray-700 text-sm whitespace-pre-wrap leading-relaxed">{issue.description}</p>
      </div>

      {/* Steps */}
      <div className="card">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Steps to Reproduce</h3>
        <pre className="text-gray-700 text-sm whitespace-pre-wrap font-mono bg-gray-50 rounded-lg p-4 border border-gray-100">
          {issue.stepsToReproduce}
        </pre>
      </div>

      {/* Patch summary */}
      {issue.patchSummary && (
        <div className="card">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Patch Summary</h3>
          <pre className="text-xs text-gray-700 font-mono bg-gray-50 rounded-lg p-4 border border-gray-100 overflow-x-auto max-h-64 overflow-y-auto">
            {issue.patchSummary}
          </pre>
        </div>
      )}

      {/* Logs */}
      <LogViewer logs={issue.sandboxLogs} title="Sandbox & Agent Logs" />
    </div>
  );
}
