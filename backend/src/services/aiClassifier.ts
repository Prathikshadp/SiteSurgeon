/**
 * services/aiClassifier.ts
 *
 * Thin wrapper around aiService.ts that maps a full Issue object
 * to the ClassificationResult type used throughout the pipeline.
 *
 * Key used: AI_API_KEY (via aiService.ts)
 */
import { Issue, ClassificationResult } from '../utils/types';
import { classifyIssue as aiClassify } from './aiService';
import { logger } from '../utils/logger';

export async function classifyIssue(issue: Issue): Promise<ClassificationResult> {
  const model = process.env.AI_MODEL || 'llama-3.3-70b-versatile';
  logger.info('Classifying issue with AI', { issueId: issue.id, model });

  const issueText = [
    `Title: ${issue.title}`,
    `Severity: ${issue.severity}`,
    `Description: ${issue.description}`,
    `Steps to Reproduce: ${issue.stepsToReproduce}`,
  ].join('\n');

  try {
    const decision = await aiClassify(issueText);
    return {
      decision,
      reason: `AI (${model}) classified this as ${decision}.`,
      confidence: 85,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('AI classification failed – defaulting to AUTOMATED', {
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
