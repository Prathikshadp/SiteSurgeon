import { Severity } from '../api/client';

const SEV_CONFIG: Record<Severity, { label: string; className: string }> = {
  critical: { label: 'Critical', className: 'bg-red-50 text-red-700 border border-red-200' },
  high:     { label: 'High',     className: 'bg-orange-50 text-orange-700 border border-orange-200' },
  medium:   { label: 'Medium',   className: 'bg-amber-50 text-amber-700 border border-amber-200' },
  low:      { label: 'Low',      className: 'bg-gray-100 text-gray-600' },
};

interface Props { severity: Severity }

export default function SeverityBadge({ severity }: Props) {
  const cfg = SEV_CONFIG[severity];
  return <span className={`badge ${cfg.className}`}>{cfg.label}</span>;
}
