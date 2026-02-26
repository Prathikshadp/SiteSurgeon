import { Link } from 'react-router-dom';
import { useDashboard } from '../hooks/useDashboard';
import StatusBadge from '../components/StatusBadge';
import SeverityBadge from '../components/SeverityBadge';
import StatCard from '../components/StatCard';

export default function DashboardPage() {
  const { issues, stats, loading, error, refresh } = useDashboard();

  if (error) {
    return (
      <div className="max-w-4xl mx-auto">
        <p className="text-red-600 text-sm">{error} – Is the backend running on port 3000?</p>
        <button onClick={refresh} className="btn-primary mt-4 text-sm">Retry</button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">Auto-refreshes every 5 seconds</p>
        </div>
        <Link to="/" className="btn-primary text-sm">+ Report Issue</Link>
      </div>

      {/* Stats grid */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard label="Total"    value={stats.total} />
          <StatCard label="Active"   value={stats.classifying + stats.sandboxing + stats.fixing} />
          <StatCard label="Merged"   value={stats.merged} />
          <StatCard label="Notified" value={stats.notified} />
          <StatCard label="Failed"   value={stats.failed} />
          <StatCard label="PRs Open" value={stats.pr_opened} />
        </div>
      )}

      {/* AI Decision breakdown */}
      {stats && (
        <div className="grid grid-cols-2 gap-4">
          <div className="card flex items-center gap-4">
            <div className="text-3xl font-bold text-gray-900 tabular-nums">{stats.automated}</div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Automated Fixes</p>
              <p className="text-xs text-gray-400">AI handled end-to-end</p>
            </div>
          </div>
          <div className="card flex items-center gap-4">
            <div className="text-3xl font-bold text-gray-900 tabular-nums">{stats.manual}</div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Manual Reviews</p>
              <p className="text-xs text-gray-400">Escalated to admin</p>
            </div>
          </div>
        </div>
      )}

      {/* Issues Table */}
      <div className="card p-0 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
            All Issues
            {loading && (
              <span className="inline-block w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            )}
          </h2>
          <span className="text-xs text-gray-400">{issues.length} total</span>
        </div>

        {issues.length === 0 ? (
          <div className="text-center py-14 px-6">
            <p className="text-gray-400 text-sm">No issues yet.</p>
            <Link to="/" className="btn-primary mt-4 inline-flex text-sm">Report the first issue</Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Title</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Severity</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Decision</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">PR</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Reported</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {issues.map((issue) => (
                  <tr key={issue.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4">
                      <Link
                        to={`/issues/${issue.id}`}
                        className="font-medium text-gray-900 hover:underline leading-tight"
                      >
                        {issue.title}
                      </Link>
                      <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[200px]">
                        {issue.repoUrl.replace('https://github.com/', '')}
                      </p>
                    </td>
                    <td className="py-3 px-4"><SeverityBadge severity={issue.severity} /></td>
                    <td className="py-3 px-4"><StatusBadge status={issue.status} /></td>
                    <td className="py-3 px-4">
                      {issue.aiDecision ? (
                        <span className={`badge text-xs ${
                          issue.aiDecision === 'AUTOMATED'
                            ? 'bg-gray-900 text-white'
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {issue.aiDecision === 'AUTOMATED' ? 'Auto' : 'Manual'}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {issue.prUrl ? (
                        <a href={issue.prUrl} target="_blank" rel="noopener noreferrer"
                           className="text-gray-900 hover:underline text-xs font-medium">
                          View PR
                        </a>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-400 whitespace-nowrap">
                      {new Date(issue.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
