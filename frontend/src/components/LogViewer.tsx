interface Props {
  logs: string[];
  title?: string;
}

export default function LogViewer({ logs, title = 'Logs' }: Props) {
  if (logs.length === 0) {
    return (
      <div className="card">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{title}</h3>
        <p className="text-xs text-gray-400 italic">No logs yet.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{title}</h3>
      <div className="bg-gray-900 rounded-lg p-4 max-h-64 overflow-y-auto font-mono text-xs space-y-0.5">
        {logs.map((line, i) => (
          <p key={i} className="text-gray-300 leading-relaxed whitespace-pre-wrap break-all">
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}
