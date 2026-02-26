import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { reportIssue, Severity } from '../api/client';

const SEVERITY_OPTIONS: { value: Severity; label: string }[] = [
  { value: 'critical', label: 'Critical – Site is down or data is at risk' },
  { value: 'high',     label: 'High – Major feature broken' },
  { value: 'medium',   label: 'Medium – Feature partially broken' },
  { value: 'low',      label: 'Low – Minor visual or UX issue' },
];

interface FormState {
  title: string;
  description: string;
  stepsToReproduce: string;
  severity: Severity;
  repoUrl: string;
}

export default function ReportPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>({
    title: '',
    description: '',
    stepsToReproduce: '',
    severity: 'medium',
    repoUrl: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => ({ ...prev, [name]: '' }));
  }

  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (!form.title.trim()) errors.title = 'Title is required';
    if (!form.description.trim()) errors.description = 'Description is required';
    if (!form.stepsToReproduce.trim()) errors.stepsToReproduce = 'Steps are required';
    if (!form.repoUrl.trim()) errors.repoUrl = 'Repository URL is required';
    else if (!/^https?:\/\/(www\.)?github\.com\/[^/]+\/[^/]+/.test(form.repoUrl)) {
      errors.repoUrl = 'Must be a valid GitHub URL (https://github.com/owner/repo)';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setServerError(null);
    try {
      const result = await reportIssue(form);
      navigate(`/issues/${result.issueId}`);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { data?: { errors?: Array<{ msg: string; path: string }> } } };
        const serverErrs = axiosErr.response?.data?.errors;
        if (serverErrs?.length) {
          const map: Record<string, string> = {};
          serverErrs.forEach(({ path, msg }) => { map[path] = msg; });
          setFieldErrors(map);
        } else {
          setServerError('Server error. Please try again.');
        }
      } else {
        setServerError('Could not connect to the backend. Is it running?');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Report a Bug</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Site Surgeon will classify your report and attempt an automated fix via AI.
        </p>
      </div>

      {serverError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-6 text-sm">
          {serverError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="title" className="label">Issue Title *</label>
          <input
            id="title" name="title" type="text" className="input"
            placeholder="e.g. Login button throws 500 error on mobile Safari"
            value={form.title} onChange={handleChange} maxLength={200}
          />
          {fieldErrors.title && <p className="text-red-500 text-xs mt-1">{fieldErrors.title}</p>}
        </div>

        <div>
          <label htmlFor="description" className="label">Description *</label>
          <textarea
            id="description" name="description" rows={4} className="input"
            placeholder="Describe the bug in detail. What did you expect? What happened instead?"
            value={form.description} onChange={handleChange} maxLength={5000}
          />
          {fieldErrors.description && <p className="text-red-500 text-xs mt-1">{fieldErrors.description}</p>}
        </div>

        <div>
          <label htmlFor="stepsToReproduce" className="label">Steps to Reproduce *</label>
          <textarea
            id="stepsToReproduce" name="stepsToReproduce" rows={4} className="input"
            placeholder={"1. Go to /login\n2. Enter valid credentials\n3. Click Sign In\n4. See error"}
            value={form.stepsToReproduce} onChange={handleChange} maxLength={5000}
          />
          {fieldErrors.stepsToReproduce && <p className="text-red-500 text-xs mt-1">{fieldErrors.stepsToReproduce}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="severity" className="label">Severity *</label>
            <select id="severity" name="severity" className="input" value={form.severity} onChange={handleChange}>
              {SEVERITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="repoUrl" className="label">GitHub Repository URL *</label>
            <input
              id="repoUrl" name="repoUrl" type="url" className="input"
              placeholder="https://github.com/owner/repo"
              value={form.repoUrl} onChange={handleChange}
            />
            {fieldErrors.repoUrl && <p className="text-red-500 text-xs mt-1">{fieldErrors.repoUrl}</p>}
          </div>
        </div>

        <button type="submit" className="btn-primary w-full mt-2" disabled={submitting}>
          {submitting ? 'Sending to AI...' : 'Submit'}
        </button>
      </form>

      {/* How it works */}
      <div className="mt-10 card">
        <h2 className="font-semibold text-sm text-gray-700 mb-3 uppercase tracking-wide">How it works</h2>
        <ol className="text-xs text-gray-500 space-y-1.5 list-decimal list-inside">
          <li>Your report is sent to the backend</li>
          <li>Claude AI classifies it as <strong className="text-gray-700">AUTOMATED</strong> or <strong className="text-gray-700">MANUAL</strong></li>
          <li>For automated issues: E2B sandbox clones the repo &amp; AI generates a fix</li>
          <li>A GitHub branch is created, files committed, and a PR is opened</li>
          <li>For automated fixes: the PR is auto-merged</li>
          <li>For manual issues: admin receives an email notification</li>
        </ol>
      </div>
    </div>
  );
}