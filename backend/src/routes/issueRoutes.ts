/**
 * routes/issueRoutes.ts
 *
 * Defines and validates routes related to issue reporting.
 */
import { Router } from 'express';
import { body } from 'express-validator';
import { reportIssue, getIssue } from '../controllers/issueController';

export const issueRouter = Router();

const GITHUB_URL_REGEX = /^https?:\/\/(www\.)?github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(\.git)?\/?$/;

const SEVERITY_VALUES = ['critical', 'high', 'medium', 'low'] as const;

const reportValidators = [
  body('title')
    .trim()
    .notEmpty().withMessage('Title is required')
    .isLength({ max: 200 }).withMessage('Title must be under 200 characters'),

  body('description')
    .trim()
    .notEmpty().withMessage('Description is required')
    .isLength({ max: 5000 }).withMessage('Description must be under 5000 characters'),

  body('stepsToReproduce')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 5000 }),

  body('severity')
    .trim()
    .notEmpty().withMessage('Severity is required')
    .isIn(SEVERITY_VALUES).withMessage(`Severity must be one of: ${SEVERITY_VALUES.join(', ')}`),

  body('repoUrl')
    .optional({ values: 'falsy' })
    .trim()
    .matches(GITHUB_URL_REGEX).withMessage('Must be a valid GitHub repository URL'),
];

// POST /api/issues/report
issueRouter.post('/report', reportValidators, reportIssue);

// GET /api/issues/:id
issueRouter.get('/:id', getIssue);
