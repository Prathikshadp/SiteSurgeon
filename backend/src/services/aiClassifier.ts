import Anthropic from '@anthropic-ai/sdk';
import { ClassificationResult, Issue } from '../utils/types';
import { logger } from '../utils/logger';

const MODEL = 'claude-3-5-sonnet-20241022';

const SYSTEM_PROMPT = `You are a senior software engineering triage assistant for Site Surgeon.
Classify bug reports as AUTOMATED (AI can fix it) or MANUAL (needs human review).

AUTOMATED: typos, small CSS fixes, missing null checks, simple logic errors, low/medium severity.
MANUAL: security issues, data-loss risks, auth changes, architecture changes, critical severity.

Respond with VALID JSON only, no markdown:
{"decision":"AUTOMATED"|"MANUAL","reason":"<one paragraph>","confidence":<0-100>}`;

export async function classifyIssue(issue: Issue): Promise<ClassificationResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    logger.warn('ANTHROPIC_API_KEY not set – defaulting to MANUAL', { issueId: issue.id });
    return { decision: 'MANUAL', reason: 'AI classifier unavailable (API key missing).', confidence: 0 };
  }

  // Create client lazily so dotenv has already run
  const client = new Anthropic({ apiKey });

  logger.info('Classifying issue with Claude', { issueId: issue.id });

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Title: ${issue.title}\nSeverity: ${issue.severity}\nDescription: ${issue.description}\nSteps: ${issue.stepsToReproduce}\nRepo: ${issue.repoUrl}`,
      }],
    });

    const raw = (response.content[0] as Anthropic.TextBlock).text.trim();

    let parsed: ClassificationResult;
    try {
      parsed = JSON.parse(raw) as ClassificationResult;
    } catch {
      logger.error('Failed to parse Claude response', { raw });
      parsed = { decision: 'MANUAL', reason: 'Could not parse AI response.', confidence: 0 };
    }

    logger.info('Classification result', { issueId: issue.id, decision: parsed.decision, confidence: parsed.confidence });
    return parsed;

  } catch (err) {
    logger.error('Claude API error – defaulting to MANUAL', {
      issueId: issue.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return { decision: 'MANUAL', reason: 'AI classifier failed. Escalating for manual review.', confidence: 0 };
  }
}
