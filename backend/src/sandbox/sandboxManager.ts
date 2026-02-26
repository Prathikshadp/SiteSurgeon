/**
 * sandbox/sandboxManager.ts
 *
 * LOCAL sandbox using Node.js child_process + fs.
 * Replaces the previous E2B cloud sandbox — no paid API needed.
 *
 * Flow:
 *   createSandbox()        → creates /tmp/site-surgeon-{timestamp}/
 *   cloneRepo()            → git clone --depth 1 <repoUrl>
 *   installDependencies()  → detects npm / yarn / pnpm / pip and installs
 *   readFile / writeFile   → fs.readFileSync / writeFileSync
 *   listRepoFiles()        → recursive walk (excludes .git, node_modules…)
 *   runTestsOrBuild()      → npm test or npm run build
 *   destroySandbox()       → fs.rmSync(workDir, { recursive: true })
 */
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { logger } from '../utils/logger';

// ─── Context ──────────────────────────────────────────────────────────────────

export interface SandboxContext {
  sandboxId: string;
  workDir: string;   // /tmp/site-surgeon-{timestamp}
  repoDir: string;   // workDir / repoName
  logs: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function repoName(repoUrl: string): string {
  const parts = repoUrl.replace(/\.git$/, '').split('/');
  return parts[parts.length - 1] || 'repo';
}

function toCloneUrl(repoUrl: string): string {
  return repoUrl.replace(/\/$/, '').replace(/\.git$/, '') + '.git';
}

/** Execute a shell command synchronously; throw on non-zero exit. */
function run(cmd: string, cwd?: string, logs?: string[]): string {
  try {
    const out = execSync(cmd, {
      encoding: 'utf8',
      timeout: 180_000,
      cwd: cwd ?? process.cwd(),
      shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
      stdio: ['pipe', 'pipe', 'pipe'],
    }) as string;
    if (logs) logs.push(`[run] ${cmd.slice(0, 80)}: OK`);
    return out;
  } catch (err: unknown) {
    const e = err as { message?: string; stdout?: string; stderr?: string };
    const msg = [e.message, e.stderr, e.stdout].filter(Boolean).join('\n').slice(0, 500);
    if (logs) logs.push(`[run] ${cmd.slice(0, 80)}: ERROR – ${msg}`);
    throw new Error(`Command failed: ${cmd.slice(0, 80)}\n${msg}`);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function createSandbox(repoUrl: string): Promise<SandboxContext> {
  const ts = Date.now();
  // os.tmpdir() works on Linux (/tmp), macOS (/tmp), and Windows (C:\Users\…\AppData\Local\Temp)
  const workDir = path.join(os.tmpdir(), `site-surgeon-${ts}`);
  fs.mkdirSync(workDir, { recursive: true });

  const sandboxId = `local-${ts}`;
  const repoDir = path.join(workDir, repoName(repoUrl));
  const logs: string[] = [];

  logger.info('Local sandbox created', { sandboxId, workDir });
  logs.push(`Sandbox created: ${sandboxId} -> ${workDir}`);

  return { sandboxId, workDir, repoDir, logs };
}

export async function cloneRepo(ctx: SandboxContext, repoUrl: string): Promise<void> {
  const cloneUrl = toCloneUrl(repoUrl);
  logger.info('Cloning repository', { cloneUrl });
  ctx.logs.push(`Cloning ${cloneUrl}...`);
  run(`git clone --depth 1 "${cloneUrl}" "${ctx.repoDir}"`, undefined, ctx.logs);
  logger.info('Repository cloned', { repoDir: ctx.repoDir });
}

export async function installDependencies(ctx: SandboxContext): Promise<void> {
  logger.info('Installing dependencies', { repoDir: ctx.repoDir });

  const has = (f: string) => fs.existsSync(path.join(ctx.repoDir, f));

  let cmd: string | null = null;
  if      (has('package-lock.json')) cmd = 'npm install --legacy-peer-deps';
  else if (has('yarn.lock'))          cmd = 'yarn install --non-interactive';
  else if (has('pnpm-lock.yaml'))     cmd = 'pnpm install --frozen-lockfile';
  else if (has('requirements.txt'))   cmd = 'pip install -r requirements.txt';
  else if (has('pyproject.toml'))     cmd = 'pip install .';

  if (!cmd) {
    ctx.logs.push('[install] No package manager detected – skipping.');
    return;
  }

  ctx.logs.push(`[install] Running: ${cmd}`);
  try {
    const out = execSync(cmd, {
      cwd: ctx.repoDir,
      encoding: 'utf8',
      timeout: 300_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }) as string;
    ctx.logs.push(`[install] Done. ${out.slice(-800)}`);
  } catch (err: unknown) {
    const e = err as { message?: string; stderr?: string };
    const msg = (e.stderr ?? e.message ?? '').slice(0, 500);
    logger.warn('Dependency install had errors (continuing)', { msg });
    ctx.logs.push(`[install] Warning: ${msg}`);
  }
}

export async function readFile(_ctx: SandboxContext, absolutePath: string): Promise<string> {
  return fs.readFileSync(absolutePath, 'utf8');
}

export async function listRepoFiles(ctx: SandboxContext): Promise<string[]> {
  const IGNORE = new Set([
    '.git', 'node_modules', 'dist', 'build', '.next', '__pycache__',
    'venv', '.env', 'coverage', '.turbo', '.cache',
  ]);

  const results: string[] = [];

  function walk(dir: string) {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries) {
      if (IGNORE.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else results.push(path.relative(ctx.repoDir, full));
    }
  }

  walk(ctx.repoDir);
  return results;
}

export async function writeFile(
  ctx: SandboxContext,
  relativePath: string,
  content: string,
): Promise<void> {
  const fullPath = path.join(ctx.repoDir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf8');
  ctx.logs.push(`[write] ${relativePath}`);
}

export async function runTestsOrBuild(
  ctx: SandboxContext,
): Promise<{ success: boolean; output: string }> {
  logger.info('Running tests / build', { repoDir: ctx.repoDir });

  const pkgPath = path.join(ctx.repoDir, 'package.json');

  if (!fs.existsSync(pkgPath)) {
    // Try pytest for Python projects
    try {
      const out = execSync('python -m pytest --tb=short -q', {
        cwd: ctx.repoDir, encoding: 'utf8', timeout: 120_000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }) as string;
      ctx.logs.push(`[test] ${out.slice(-2000)}`);
      return { success: true, output: out };
    } catch (err: unknown) {
      const e = err as { message?: string; stderr?: string; stdout?: string };
      const out = (e.stdout ?? e.stderr ?? e.message ?? '').slice(0, 1000);
      return { success: false, output: out };
    }
  }

  let pkgJson: { scripts?: Record<string, string> } = {};
  try { pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf8')); } catch { /* ignore */ }

  const scripts = pkgJson.scripts ?? {};
  let cmd: string | null = null;
  if      (scripts['test'])  cmd = 'npm test -- --passWithNoTests';
  else if (scripts['build']) cmd = 'npm run build';

  if (!cmd) {
    ctx.logs.push('[test/build] No test or build script found.');
    return { success: true, output: 'No test/build script.' };
  }

  try {
    const out = execSync(cmd, {
      cwd: ctx.repoDir, encoding: 'utf8', timeout: 120_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }) as string;
    ctx.logs.push(`[test/build] ${out.slice(-2000)}`);
    return { success: true, output: out };
  } catch (err: unknown) {
    const e = err as { message?: string; stderr?: string; stdout?: string };
    const msg = (e.stdout ?? e.stderr ?? e.message ?? '').slice(0, 1000);
    ctx.logs.push(`[test/build] Error: ${msg}`);
    // Non-zero exit from tests is not fatal — still return for reporting
    return { success: false, output: msg };
  }
}

export async function destroySandbox(ctx: SandboxContext): Promise<void> {
  try {
    fs.rmSync(ctx.workDir, { recursive: true, force: true });
    logger.info('Local sandbox cleaned up', { workDir: ctx.workDir });
  } catch {
    logger.warn('Failed to clean up sandbox folder', { workDir: ctx.workDir });
  }
}
