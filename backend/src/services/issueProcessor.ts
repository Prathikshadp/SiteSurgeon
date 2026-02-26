import { v4 as uuidv4 } from 'uuid';
import { Issue, ReportIssueBody, ClassificationResult } from '../utils/types';
import { issueStore } from '../utils/store';
import { classifyIssue } from './aiClassifier';
import { createAndSubmitFix } from './githubService';
import { sendManualReviewEmail, sendAutomatedFixEmail } from './emailService';
import { logger } from '../utils/logger';

function update(id: string, partial: Partial<Issue>) {
  issueStore.update(id, partial);
}

function appendLogs(issueId: string, newLogs: string[]) {
  const existing = issueStore.findById(issueId);
  if (!existing) return;
  issueStore.update(issueId, { sandboxLogs: [...existing.sandboxLogs, ...newLogs] });
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function processIssue(body: ReportIssueBody): Promise<Issue> {
  const issue: Issue = {
    id: uuidv4(),
    title: body.title,
    description: body.description,
    stepsToReproduce: body.stepsToReproduce,
    severity: body.severity,
    repoUrl: body.repoUrl,
    status: 'received',
    sandboxLogs: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  issueStore.save(issue);
  logger.info('Issue received', { issueId: issue.id, title: issue.title });

  // Fire-and-forget – HTTP response already sent with 201
  runPipeline(issue).catch((err) => {
    logger.error('Pipeline crashed (unhandled)', {
      issueId: issue.id,
      error: err instanceof Error ? err.message : String(err),
    });
    update(issue.id, { status: 'failed' });
  });

  return issue;
}

// ── Main pipeline ─────────────────────────────────────────────────────────────

async function runPipeline(issue: Issue): Promise<void> {
  const demoMode = process.env.DEMO_MODE === 'true';

  // ── Step 1: Classify ────────────────────────────────────────────────────────
  update(issue.id, { status: 'classifying' });
  logger.info('[1/6] Classifying issue', { issueId: issue.id });

  let classification: ClassificationResult = { decision: 'MANUAL', reason: 'Default', confidence: 0 };
  try {
    classification = await classifyIssue(issue);
  } catch (err) {
    logger.error('[1/6] Classification error – defaulting to MANUAL', {
      issueId: issue.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  update(issue.id, { aiDecision: classification.decision, aiReason: classification.reason });
  logger.info('[1/6] Classified', { issueId: issue.id, decision: classification.decision });

  // ── Step 2: Manual path ─────────────────────────────────────────────────────
  if (classification.decision === 'MANUAL') {
    logger.info('[2/6] Manual path – sending notification', { issueId: issue.id });
    try {
      await sendManualReviewEmail({ ...issue, aiDecision: classification.decision, aiReason: classification.reason });
    } catch (emailErr) {
      logger.warn('[2/6] Failed to send manual email (SMTP may not be configured)', {
        error: emailErr instanceof Error ? emailErr.message : String(emailErr),
      });
    }
    update(issue.id, { status: 'notified' });
    return;
  }

  // ── Step 3: Sandbox + AI fix ────────────────────────────────────────────────
  update(issue.id, { status: 'sandboxing' });
  logger.info('[3/6] Starting sandbox phase', { issueId: issue.id, demoMode });

  let filesForGithub: Array<{ path: string; content: string }> = [];
  let commitMessage = `fix: AI automated fix for "${issue.title}"`;
  let patchSummary = 'Placeholder fix committed by Site Surgeon demo.';

  if (demoMode) {
    // ── DEMO MODE: skip sandbox and AI coding agent entirely ────────────────
    logger.info('[3/6] DEMO_MODE – skipping sandbox', { issueId: issue.id });
    appendLogs(issue.id, ['[demo] Sandbox skipped in DEMO_MODE']);

    update(issue.id, { status: 'fixing' });
    logger.info('[4/6] DEMO_MODE – using placeholder fix', { issueId: issue.id });

    // Create a small placeholder file so the PR has something to show
    filesForGithub = [{
      path: '.site-surgeon/last-fix.md',
      content: [
        '# Site Surgeon – Automated Fix',
        '',
        `**Issue:** ${issue.title}`,
        `**Severity:** ${issue.severity}`,
        `**Date:** ${new Date().toISOString()}`,
        '',
        '## Description',
        issue.description,
        '',
        '## Note',
        'This fix was generated in DEMO_MODE. Connect real E2B and Anthropic credentials for AI-generated patches.',
      ].join('\n'),
    }];

    commitMessage = `fix(demo): AI attempted fix for "${issue.title}"`;
    patchSummary = 'Demo mode: placeholder commit to show end-to-end pipeline.';

    appendLogs(issue.id, ['[demo] Placeholder fix generated']);

  } else {
    // ── REAL MODE ────────────────────────────────────────────────────────────
    try {
      const {
        createSandbox, cloneRepo, installDependencies, destroySandbox,
      } = await import('../sandbox/sandboxManager');
      const { runCodingAgent } = await import('../agents/codingAgent');

      logger.info('[3/6] Creating E2B sandbox', { issueId: issue.id });
      const ctx = await createSandbox(issue.repoUrl);
      update(issue.id, { sandboxId: ctx.sandboxId });

      try {
        await cloneRepo(ctx, issue.repoUrl);
        await installDependencies(ctx);
        appendLogs(issue.id, ctx.logs);

        update(issue.id, { status: 'fixing' });
        logger.info('[4/6] Running coding agent', { issueId: issue.id });

        const agentResult = await runCodingAgent(issue, ctx);
        appendLogs(issue.id, agentResult.logs);

        if (agentResult.success && agentResult.filesChanged.length > 0) {
          const { readFile } = await import('../sandbox/sandboxManager');
          for (const relPath of agentResult.filesChanged) {
            try {
              const content = await readFile(ctx, `${ctx.repoDir}/${relPath}`);
              filesForGithub.push({ path: relPath, content });
            } catch {
              logger.warn('Could not read fixed file from sandbox', { relPath });
            }
          }
          commitMessage = agentResult.commitMessage;
          patchSummary = agentResult.patch;
        } else {
          logger.warn('[4/6] Agent produced no fix – escalating to MANUAL', { issueId: issue.id, error: agentResult.error });
          update(issue.id, { aiDecision: 'MANUAL', aiReason: `Agent failed: ${agentResult.error}` });
          try { await sendManualReviewEmail({ ...issue, aiDecision: 'MANUAL', aiReason: agentResult.error }); } catch {}
          update(issue.id, { status: 'notified' });
          return;
        }

      } finally {
        await destroySandbox(ctx);
      }

    } catch (sandboxErr) {
      logger.error('[3/6] Sandbox failed – escalating to MANUAL', {
        issueId: issue.id,
        error: sandboxErr instanceof Error ? sandboxErr.message : String(sandboxErr),
      });
      appendLogs(issue.id, [`[error] Sandbox failed: ${sandboxErr instanceof Error ? sandboxErr.message : String(sandboxErr)}`]);
      update(issue.id, { aiDecision: 'MANUAL', aiReason: 'Sandbox unavailable. Escalated for manual review.' });
      try { await sendManualReviewEmail({ ...issue, aiDecision: 'MANUAL', aiReason: 'Sandbox failed.' }); } catch {}
      update(issue.id, { status: 'notified' });
      return;
    }
  }

  // ── Step 5: GitHub operations ───────────────────────────────────────────────
  logger.info('[5/6] Creating branch and PR', { issueId: issue.id });

  let prResult;
  try {
    prResult = await createAndSubmitFix(issue, filesForGithub, commitMessage, patchSummary, true);
  } catch (githubErr) {
    logger.error('[5/6] GitHub PR creation failed', {
      issueId: issue.id,
      error: githubErr instanceof Error ? githubErr.message : String(githubErr),
    });
    update(issue.id, { status: 'failed' });
    return;
  }

  update(issue.id, {
    status: prResult.merged ? 'merged' : 'pr_opened',
    branchName: prResult.branchName,
    prUrl: prResult.prUrl,
    patchSummary,
    commitMessage,
  });

  logger.info('[5/6] PR created', { issueId: issue.id, prUrl: prResult.prUrl, merged: prResult.merged });

  // ── Step 6: Email summary ───────────────────────────────────────────────────
  logger.info('[6/6] Sending summary email', { issueId: issue.id });
  try {
    const latest = issueStore.findById(issue.id) as Issue;
    await sendAutomatedFixEmail(latest, prResult.prUrl, prResult.merged, patchSummary);
  } catch (emailErr) {
    logger.warn('[6/6] Failed to send fix email (SMTP may not be configured)', {
      error: emailErr instanceof Error ? emailErr.message : String(emailErr),
    });
  }

  logger.info('Pipeline complete ✓', { issueId: issue.id, status: prResult.merged ? 'merged' : 'pr_opened' });
}
