/**
 * services/aiClassifier.ts
 *
 * Thin wrapper around aiService.ts that maps a full Issue object
 * to the ClassificationResult type used throughout the pipeline.
 *
 * Key used: GROQ_API_KEY (via aiService.ts)
 */
import { Issue, ClassificationResult } from '../utils/types';
import { classifyIssue as groqClassify } from './aiService';
import { logger } from '../utils/logger';

export async function classifyIssue(issue: Issue): Promise<ClassificationResult> {
  logger.info('Classifying issue with Groq', { issueId: issue.id });

  const issueText = [
    `Title: ${issue.title}`,
    `Severity: ${issue.severity}`,
    `Description: ${issue.description}`,
    `Steps to Reproduce: ${issue.stepsToReproduce}`,
  ].join('\n');

  try {
    const decision = await groqClassify(issueText);
    return {
      decision,
      reason: `Groq (llama-3.3-70b-versatile) classified this as ${decision}.`,
      confidence: 85,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('Groq classification failed – defaulting to AUTOMATED', {
      issueId: issue.id,
      error: msg,
    });
    return {
      decision: 'AUTOMATED',
      reason: 'AI classifier unavailable; defaulting to automated pipeline.',
      confidence: 50,
    };
  }
}
