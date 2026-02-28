/**
 * services/aiService.ts
 *
 * Groq-powered AI service for Site Surgeon.
 * Uses the OpenAI-compatible Groq API (free tier).
 *
 * Key used: GROQ_API_KEY
 * Model:    llama-3.3-70b-versatile
 */
import OpenAI from 'openai';
import { logger } from '../utils/logger';

const MODEL = 'llama-3.3-70b-versatile';

function getClient(): OpenAI {
  return new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Classification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Classify a bug-report text as AUTOMATED or MANUAL.
 * The prompt forces the model to reply with exactly one of those two words.
 */
export async function classifyIssue(issueText: string): Promise<'AUTOMATED' | 'MANUAL'> {
  const client = getClient();

  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 5,
    temperature: 0,
    messages: [
      {
        role: 'system',
        content: [
          'You are a bug-triage assistant for an AI self-healing web system.',
          'Reply with ONLY one word: AUTOMATED or MANUAL.',
          '',
          'Use AUTOMATED for:',
          '  • Typos, text/label changes, small CSS fixes',
          '  • Simple logic errors with clear reproduction steps',
          '  • Missing null checks or guard clauses',
          '  • Small config changes',
          '  • Severity is low or medium AND the fix path is obvious',
          '',
          'Use MANUAL for:',
          '  • Security vulnerabilities (XSS, SQLi, auth bypass …)',
          '  • Data-loss or data-corruption risks',
          '  • Architecture or database schema changes',
          '  • Critical severity with unclear reproduction',
          '  • Anything touching payments, PII, or sensitive data',
        ].join('\n'),
      },
      { role: 'user', content: issueText },
    ],
  });

  const raw = (response.choices[0]?.message?.content ?? '').trim().toUpperCase();
  const decision: 'AUTOMATED' | 'MANUAL' = raw.startsWith('AUTOMATED') ? 'AUTOMATED' : 'MANUAL';
  logger.info('Groq classification', { decision, raw });
  return decision;
}

// ─────────────────────────────────────────────────────────────────────────────
// File identification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ask Groq to identify which files (up to 5) are most relevant to the bug.
 */
export async function identifyRelevantFiles(
  issueText: string,
  allFiles: string[],
): Promise<string[]> {
  const client = getClient();
  const fileList = allFiles.slice(0, 300).join('\n'); // stay within context window

  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 256,
    temperature: 0,
    messages: [
      {
        role: 'system',
        content: [
          'You are a senior software engineer.',
          'Given a bug report and the full list of files in a repository,',
          'identify which files (up to 5) are MOST LIKELY to contain the bug.',
          'Respond with VALID JSON only. No markdown, no explanation.',
          'Schema: { "files": ["path/to/file1.ts", "path/to/file2.ts"] }',
        ].join('\n'),
      },
      {
        role: 'user',
        content: `Bug Report:\n${issueText}\n\nRepository files:\n${fileList}`,
      },
    ],
  });

  const raw = (response.choices[0]?.message?.content ?? '').trim();
  // Extract JSON object even if wrapped in prose/markdown
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  const cleaned = jsonMatch ? jsonMatch[0] : raw;

  try {
    const parsed = JSON.parse(cleaned) as { files: string[] };
    return parsed.files.slice(0, 5);
  } catch {
    logger.warn('identifyRelevantFiles – bad JSON, using fallback', { raw: raw.slice(0, 200) });
    // Fallback: first 3 source files
    return allFiles.filter((f) => /\.(ts|js|tsx|jsx|py)$/.test(f)).slice(0, 3);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fix generation
// ─────────────────────────────────────────────────────────────────────────────

export interface FixResult {
  commitMessage: string;
  patchSummary: string;
  files: Array<{ path: string; content: string }>;
}

/**
 * Generate fixed file contents for the given bug report.
 * Returns the commit message, a patch summary, and the updated files.
 */
export async function generateFix(
  issueText: string,
  fileContents: Record<string, string>,
): Promise<FixResult> {
  const client = getClient();

  const fileBlocks = Object.entries(fileContents)
    .map(([p, c]) => `=== FILE: ${p} ===\n${c}`)
    .join('\n\n');

  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 8000,
    temperature: 0.1,
    messages: [
      {
        role: 'system',
        content: [
          'You are an expert software engineer performing automated bug fixing.',
          'You receive a bug report and source files.',
          'Produce fixed versions of all files that need changes.',
          '',
          'CRITICAL: Your ENTIRE response must be a single raw JSON object.',
          'Do NOT include any text before or after the JSON.',
          'Do NOT use markdown code fences (```json ... ```).',
          'Do NOT include explanations outside the JSON.',
          '',
          'Rules:',
          '  • Only change what is necessary to fix the reported bug.',
          '  • Do NOT refactor unrelated code.',
          '  • Always provide the COMPLETE file content (not a diff).',
          '  • If a file does not need changes, omit it entirely.',
          '',
          'Respond with ONLY this JSON schema:',
          '{',
          '  "commitMessage": "<imperative commit message, max 72 chars>",',
          '  "patchSummary": "<one-paragraph human-readable explanation>",',
          '  "files": [',
          '    { "path": "relative/path/from/repo/root.ext", "content": "<full file content>" }',
          '  ]',
          '}',
        ].join('\n'),
      },
      {
        role: 'user',
        content: `Bug Report:\n${issueText}\n\nSource Files:\n${fileBlocks}`,
      },
    ],
  });

  const raw = (response.choices[0]?.message?.content ?? '').trim();

  // Robust JSON extraction: use bracket-counting to find the outermost JSON object
  function extractOutermostJSON(text: string): string | null {
    const start = text.indexOf('{');
    if (start === -1) return null;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) return text.substring(start, i + 1); }
    }
    return null;
  }

  // Strip markdown code fences if present
  let cleaned = raw;
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) cleaned = fenceMatch[1].trim();

  const jsonStr = extractOutermostJSON(cleaned) || extractOutermostJSON(raw);
  if (!jsonStr) {
    throw new Error('Groq returned no JSON object in fix response:\n' + raw.slice(0, 300));
  }

  try {
    return JSON.parse(jsonStr) as FixResult;
  } catch (parseErr) {
    // Attempt to fix common JSON issues (control chars inside strings)
    try {
      const sanitized = jsonStr.replace(/[\x00-\x1F\x7F]/g, (ch) => {
        if (ch === '\n') return '\\n';
        if (ch === '\r') return '\\r';
        if (ch === '\t') return '\\t';
        return '';
      });
      return JSON.parse(sanitized) as FixResult;
    } catch {
      throw new Error('Groq returned invalid JSON for fix response:\n' + raw.slice(0, 500));
    }
  }
}
