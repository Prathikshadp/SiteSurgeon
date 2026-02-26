import { IssueStatus } from '../api/client';

const STATUS_CONFIG: Record<IssueStatus, { label: string; className: string }> = {
  received:    { label: 'Received',    className: 'bg-gray-100 text-gray-600' },
  classifying: { label: 'Classifying', className: 'bg-amber-50 text-amber-700 border border-amber-200 animate-pulse' },
  sandboxing:  { label: 'Sandboxing',  className: 'bg-sky-50 text-sky-700 border border-sky-200 animate-pulse' },
  fixing:      { label: 'Fixing',      className: 'bg-indigo-50 text-indigo-700 border border-indigo-200 animate-pulse' },
  pr_opened:   { label: 'PR Opened',   className: 'bg-violet-50 text-violet-700 border border-violet-200' },
  merged:      { label: 'Merged ✓',    className: 'bg-green-50 text-green-700 border border-green-200' },
  notified:    { label: 'Notified',    className: 'bg-orange-50 text-orange-700 border border-orange-200' },
  failed:      { label: 'Failed',      className: 'bg-red-50 text-red-600 border border-red-200' },
};

interface Props { status: IssueStatus }

export default function StatusBadge({ status }: Props) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, className: 'bg-gray-100 text-gray-600' };
  return <span className={`badge ${cfg.className}`}>{cfg.label}</span>;
}
