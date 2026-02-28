// ── Severity levels ───────────────────────────────────────────────────────────
export type Severity = 'critical' | 'high' | 'medium' | 'low';

// ── AI classification ─────────────────────────────────────────────────────────
export type AiDecision = 'AUTOMATED' | 'MANUAL';

// ── Issue statuses ────────────────────────────────────────────────────────────
export type IssueStatus =
  | 'received'
  | 'classifying'
  | 'sandboxing'
  | 'fixing'
  | 'pr_opened'
  | 'merged'
  | 'notified'
  | 'failed';

// ── Core issue type stored in memory / DB ────────────────────────────────────
export interface Issue {
  id: string;
  title: string;
  description: string;
  stepsToReproduce: string;
  severity: Severity;
  repoUrl: string;
  status: IssueStatus;
  aiDecision?: AiDecision;
  aiReason?: string;
  sandboxId?: string;
  sandboxLogs: string[];
  branchName?: string;
  prUrl?: string;
  patchSummary?: string;
  commitMessage?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Request body for POST /report ─────────────────────────────────────────────
export interface ReportIssueBody {
  title: string;
  description: string;
  stepsToReproduce: string;
  severity: Severity;
  repoUrl?: string;
}

// ── AI classifier result ──────────────────────────────────────────────────────
export interface ClassificationResult {
  decision: AiDecision;
  reason: string;
  confidence: number; // 0-100
}

// ── Agent result ──────────────────────────────────────────────────────────────
export interface AgentResult {
  success: boolean;
  patch: string; // unified diff or file-level changes JSON
  commitMessage: string;
  filesChanged: string[];
  logs: string[];
  error?: string;
}

// ── GitHub service result ─────────────────────────────────────────────────────
export interface PrResult {
  prUrl: string;
  prNumber: number;
  branchName: string;
  merged: boolean;
}
