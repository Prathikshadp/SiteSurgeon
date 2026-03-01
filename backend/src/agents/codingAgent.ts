/**
 * agents/codingAgent.ts
 *
 * AI Coding Agent for automated bug fixing.
 * Uses the backend's AI service (OpenAI-compatible, works with any provider)
 * combined with the E2B sandbox for file operations:
 *   1. List repo files in the sandbox
 *   2. Ask AI to identify relevant files
 *   3. Read those files from the sandbox
 *   4. Ask AI to generate fixes
 *   5. Write fixed files back to the sandbox
 *   6. Detect changed files via git status
 *
 * Key used: AI_API_KEY / AI_BASE_URL / AI_MODEL (via aiService.ts OpenAI SDK)
 */
import { Issue, AgentResult } from '../utils/types';
import {
  SandboxContext,
  listRepoFiles,
  readFile,
  writeFile,
} from '../sandbox/sandboxManager';
import { identifyRelevantFiles, generateFix } from '../services/aiService';
import { logger } from '../utils/logger';

/**
 * Run the full AI coding agent pipeline.
 * AI calls happen on the backend via the OpenAI SDK (works with Kimi, Groq, etc.).
 * File I/O happens in the E2B sandbox.
 */
export async function runCodingAgent(
  issue: Issue,
  ctx: SandboxContext,
): Promise<AgentResult> {
  const agentLogs: string[] = [];

  try {
    // ── Step 1: List repo files ──────────────────────────────────────────────
    agentLogs.push('[agent] Listing repository files...');
    logger.info('Listing repo files in sandbox', { issueId: issue.id });

    const allFiles = await listRepoFiles(ctx);
    agentLogs.push(`[agent] Found ${allFiles.length} files in repo`);

    if (allFiles.length === 0) {
      return {
        success: false,
        patch: '',
        commitMessage: '',
        filesChanged: [],
        logs: agentLogs,
        error: 'Repository appears to be empty',
      };
    }

    // ── Step 2: Ask AI to identify relevant files ────────────────────────────
    agentLogs.push('[agent] Asking AI to identify relevant files...');
    logger.info('Identifying relevant files via AI', { issueId: issue.id });

    const issueText = [
      `Title: ${issue.title}`,
      `Severity: ${issue.severity}`,
      `Description: ${issue.description}`,
      issue.stepsToReproduce ? `Steps to Reproduce: ${issue.stepsToReproduce}` : '',
    ].filter(Boolean).join('\n');

    const relevantFiles = await identifyRelevantFiles(issueText, allFiles);
    agentLogs.push(`[agent] AI identified ${relevantFiles.length} relevant files: ${relevantFiles.join(', ')}`);

    if (relevantFiles.length === 0) {
      return {
        success: false,
        patch: '',
        commitMessage: '',
        filesChanged: [],
        logs: agentLogs,
        error: 'AI could not identify any relevant files to fix',
      };
    }

    // ── Step 3: Read relevant files from sandbox ─────────────────────────────
    agentLogs.push('[agent] Reading relevant files from sandbox...');
    const fileContents: Record<string, string> = {};

    for (const relPath of relevantFiles) {
      try {
        const content = await readFile(ctx, `${ctx.repoDir}/${relPath}`);
        fileContents[relPath] = content;
        agentLogs.push(`[agent] Read: ${relPath} (${content.length} chars)`);
      } catch (err) {
        logger.warn('Could not read file from sandbox', { relPath, error: String(err) });
        agentLogs.push(`[agent] Skip: ${relPath} (read error)`);
      }
    }

    if (Object.keys(fileContents).length === 0) {
      return {
        success: false,
        patch: '',
        commitMessage: '',
        filesChanged: [],
        logs: agentLogs,
        error: 'Could not read any of the identified files from the sandbox',
      };
    }

    // ── Step 4: Ask AI to generate the fix ───────────────────────────────────
    agentLogs.push('[agent] Asking AI to generate fix...');
    logger.info('Generating fix via AI', { issueId: issue.id, fileCount: Object.keys(fileContents).length });

    const fixResult = await generateFix(issueText, fileContents);
    agentLogs.push(`[agent] AI generated fix: ${fixResult.files.length} files changed`);
    agentLogs.push(`[agent] Commit: ${fixResult.commitMessage}`);

    if (fixResult.files.length === 0) {
      return {
        success: false,
        patch: '',
        commitMessage: '',
        filesChanged: [],
        logs: agentLogs,
        error: 'AI generated no file changes',
      };
    }

    // ── Step 5: Write fixed files back to sandbox ────────────────────────────
    agentLogs.push('[agent] Writing fixed files to sandbox...');
    const filesChanged: string[] = [];

    for (const file of fixResult.files) {
      try {
        await writeFile(ctx, file.path, file.content);
        filesChanged.push(file.path);
        agentLogs.push(`[agent] Wrote: ${file.path}`);
      } catch (err) {
        logger.warn('Could not write file to sandbox', { path: file.path, error: String(err) });
        agentLogs.push(`[agent] Failed to write: ${file.path}`);
      }
    }

    if (filesChanged.length === 0) {
      return {
        success: false,
        patch: '',
        commitMessage: '',
        filesChanged: [],
        logs: agentLogs,
        error: 'Failed to write any fixed files to the sandbox',
      };
    }

    const patch = [
      `AI agent fixed: ${issue.title}`,
      '',
      fixResult.patchSummary,
      '',
      'Files changed:',
      ...filesChanged.map((f) => `- ${f}`),
    ].join('\n');

    logger.info('AI agent produced a fix', { filesChanged });

    return {
      success: true,
      patch,
      commitMessage: fixResult.commitMessage,
      filesChanged,
      logs: agentLogs,
    };

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    agentLogs.push(`Agent error: ${message}`);
    logger.error('Coding agent failed', { error: message });
    return {
      success: false,
      patch: '',
      commitMessage: '',
      filesChanged: [],
      logs: agentLogs,
      error: message,
    };
  }
}
