/**
 * agents/codingAgent.ts
 *
 * AI Coding Agent for automated bug fixing.
 * ReAct-style pipeline:
 *   1. List repo files
 *   2. Ask AI which files are relevant
 *   3. Read those files from the local sandbox
 *   4. Ask AI to produce fixed file versions
 *   5. Write fixed files back to the sandbox
 *   6. Return AgentResult
 *
 * Key used: AI_API_KEY (via aiService.ts)
 */
import { Issue, AgentResult } from '../utils/types';
import { SandboxContext, listRepoFiles, readFile, writeFile } from '../sandbox/sandboxManager';
import { identifyRelevantFiles, generateFix } from '../services/aiService';
import { logger } from '../utils/logger';

/**
 * Run the full AI coding agent pipeline inside a sandbox context.
 */
export async function runCodingAgent(
  issue: Issue,
  ctx: SandboxContext,
): Promise<AgentResult> {
  const agentLogs: string[] = [];

  try {
    // Step 1 – list all files
    agentLogs.push('Step 1: Listing repository files...');
    const allFiles = await listRepoFiles(ctx);
    agentLogs.push(`Found ${allFiles.length} files.`);
    logger.info('Agent listed repo files', { count: allFiles.length });

    // Step 2 – ask Groq which files are relevant
    agentLogs.push('Step 2: Identifying relevant files with AI...');
    const issueText = [
      `Title: ${issue.title}`,
      `Severity: ${issue.severity}`,
      `Description: ${issue.description}`,
      `Steps to Reproduce: ${issue.stepsToReproduce}`,
    ].join('\n');

    const relevantFiles = await identifyRelevantFiles(issueText, allFiles);
    agentLogs.push(`Relevant files: ${relevantFiles.join(', ')}`);
    logger.info('Relevant files identified', { relevantFiles });

    // Step 3 – read those files from sandbox
    agentLogs.push('Step 3: Reading relevant files...');
    const fileContents: Record<string, string> = {};
    for (const filePath of relevantFiles) {
      try {
        const content = await readFile(ctx, `${ctx.repoDir}/${filePath}`);
        fileContents[filePath] = content;
        agentLogs.push(`Read: ${filePath} (${content.length} chars)`);
      } catch {
        agentLogs.push(`Skipped (read error): ${filePath}`);
      }
    }

    if (Object.keys(fileContents).length === 0) {
      throw new Error('Could not read any relevant files from the sandbox.');
    }

    // Step 4 – generate fix with Groq
    agentLogs.push(`Step 4: Generating fix with AI (${process.env.AI_MODEL || 'default'})...`);
    const fixResponse = await generateFix(issueText, fileContents);
    agentLogs.push(`Fix generated. Files to change: ${fixResponse.files.length}`);
    agentLogs.push(`Commit: ${fixResponse.commitMessage}`);
    logger.info('Fix generated', { filesChanged: fixResponse.files.length });

    // Step 5 – write fixed files back to sandbox
    agentLogs.push('Step 5: Writing fixed files to sandbox...');
    for (const { path: filePath, content } of fixResponse.files) {
      await writeFile(ctx, filePath, content);
      agentLogs.push(`Written: ${filePath}`);
    }

    // Build a patch summary for the PR body
    const patch = fixResponse.patchSummary + '\n\n' +
      fixResponse.files
        .map((f) => `## ${f.path}\n\`\`\`\n${f.content.slice(0, 300)}${f.content.length > 300 ? '\n...' : ''}\n\`\`\``)
        .join('\n\n');

    return {
      success: true,
      patch,
      commitMessage: fixResponse.commitMessage,
      filesChanged: fixResponse.files.map((f) => f.path),
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
