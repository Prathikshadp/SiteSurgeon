/**
 * sandbox/sandboxManager.ts
 *
 * Cloud sandbox powered by E2B (https://e2b.dev).
 * Each issue gets an isolated Linux container — git, node, npm pre-installed.
 *
 * Flow:
 *   createSandbox()        → spin up E2B container
 *   cloneRepo()            → git clone --depth 1 <repoUrl>
 *   installDependencies()  → npm / yarn / pnpm / pip install
 *   readFile / writeFile   → sbx.files.read / write
 *   listRepoFiles()        → `find` inside the container
 *   runTestsOrBuild()      → npm test or npm run build
 *   destroySandbox()       → sbx.kill()
 */
import { Sandbox } from 'e2b';
import { logger } from '../utils/logger';

// ─── Context ─────────────────────────────────────────────────────────────────

export interface SandboxContext {
  sandboxId: string;
  sandbox: Sandbox;
  workDir: string;  // absolute path inside container, e.g. /home/user
  repoDir: string;  // workDir/repoName
  logs: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function repoName(repoUrl: string): string {
  const parts = repoUrl.replace(/\.git$/, '').split('/');
  return parts[parts.length - 1] || 'repo';
}

function toCloneUrl(repoUrl: string): string {
  return repoUrl.replace(/\/$/, '').replace(/\.git$/, '') + '.git';
}

/** Run a shell command inside the E2B container; throw on non-zero exit. */
async function run(
  sbx: Sandbox,
  cmd: string,
  cwd?: string,
  logs?: string[],
  timeoutMs = 180_000,
): Promise<string> {
  const fullCmd = cwd ? `cd "${cwd}" && ${cmd}` : cmd;
  const result = await sbx.commands.run(fullCmd, { timeoutMs });

  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();

  if (result.exitCode !== 0) {
    if (logs) logs.push(`[run] ${cmd.slice(0, 80)}: EXIT ${result.exitCode}`);
    throw new Error(`Command failed (exit ${result.exitCode}): ${cmd.slice(0, 80)}\n${output.slice(0, 500)}`);
  }

  if (logs) logs.push(`[run] ${cmd.slice(0, 80)}: OK`);
  return result.stdout ?? '';
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function createSandbox(repoUrl: string): Promise<SandboxContext> {
  const apiKey = process.env.E2B_API_KEY;
  if (!apiKey) throw new Error('E2B_API_KEY is not set in environment');

  const template = process.env.E2B_AGENT_TEMPLATE || 'plasma-agent-sandbox';
  logger.info('Creating E2B sandbox...', { template });
  const sandbox = await Sandbox.create(template, { apiKey, timeoutMs: 600_000 });

  const sandboxId = sandbox.sandboxId;
  const workDir = '/home/user';
  const repoDir = `${workDir}/${repoName(repoUrl)}`;
  const logs: string[] = [];

  logger.info('E2B sandbox created', { sandboxId });
  logs.push(`E2B sandbox created: ${sandboxId}`);

  return { sandboxId, sandbox, workDir, repoDir, logs };
}

export async function cloneRepo(ctx: SandboxContext, repoUrl: string): Promise<void> {
  const cloneUrl = toCloneUrl(repoUrl);
  logger.info('Cloning repository', { cloneUrl });
  ctx.logs.push(`Cloning ${cloneUrl}...`);
  await run(ctx.sandbox, `git clone --depth 1 "${cloneUrl}" "${ctx.repoDir}"`, undefined, ctx.logs);
  logger.info('Repository cloned', { repoDir: ctx.repoDir });
}

export async function installDependencies(ctx: SandboxContext): Promise<void> {
  logger.info('Installing dependencies', { repoDir: ctx.repoDir });

  // Detect package manager by checking for lockfiles
  const checkResult = await ctx.sandbox.commands.run(
    `ls "${ctx.repoDir}" 2>/dev/null`,
  );
  const files = checkResult.stdout ?? '';

  let cmd: string | null = null;
  if (files.includes('package-lock.json')) cmd = 'npm install --legacy-peer-deps';
  else if (files.includes('yarn.lock')) cmd = 'yarn install --non-interactive';
  else if (files.includes('pnpm-lock.yaml')) cmd = 'pnpm install --frozen-lockfile';
  else if (files.includes('requirements.txt')) cmd = 'pip install -r requirements.txt';
  else if (files.includes('pyproject.toml')) cmd = 'pip install .';

  if (!cmd) {
    ctx.logs.push('[install] No package manager detected – skipping.');
    return;
  }

  ctx.logs.push(`[install] Running: ${cmd}`);
  try {
    await run(ctx.sandbox, cmd, ctx.repoDir, ctx.logs, 300_000);
    ctx.logs.push('[install] Done.');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('Dependency install had errors (continuing)', { msg });
    ctx.logs.push(`[install] Warning: ${msg.slice(0, 300)}`);
  }
}

export async function readFile(_ctx: SandboxContext, absolutePath: string): Promise<string> {
  const result = await _ctx.sandbox.files.read(absolutePath);
  return result as string;
}

export async function listRepoFiles(ctx: SandboxContext): Promise<string[]> {
  const IGNORE = [
    '.git', 'node_modules', 'dist', 'build', '.next',
    '__pycache__', 'venv', 'coverage', '.turbo', '.cache',
  ];

  const excludes = IGNORE.map((d) => `-not -path "*/${d}/*" -not -name "${d}"`).join(' ');
  const cmd = `find "${ctx.repoDir}" -type f ${excludes} 2>/dev/null | head -200`;

  const result = await ctx.sandbox.commands.run(cmd);
  const lines = (result.stdout ?? '').split('\n').filter(Boolean);

  // Strip the repoDir prefix to get relative paths
  return lines.map((l) =>
    l.startsWith(ctx.repoDir + '/') ? l.slice(ctx.repoDir.length + 1) : l,
  );
}

export async function writeFile(
  ctx: SandboxContext,
  relativePath: string,
  content: string,
): Promise<void> {
  const fullPath = `${ctx.repoDir}/${relativePath}`;
  // Ensure parent dir exists
  const lastSlash = fullPath.lastIndexOf('/');
  if (lastSlash > 0) {
    const dir = fullPath.substring(0, lastSlash);
    await ctx.sandbox.commands.run(`mkdir -p "${dir}"`);
  }
  await ctx.sandbox.files.write(fullPath, content);
  ctx.logs.push(`[write] ${relativePath}`);
}

export async function runTestsOrBuild(
  ctx: SandboxContext,
): Promise<{ success: boolean; output: string }> {
  logger.info('Running tests / build', { repoDir: ctx.repoDir });

  // Check if package.json exists
  const checkPkg = await ctx.sandbox.commands.run(`test -f "${ctx.repoDir}/package.json" && echo yes || echo no`);
  const hasPkg = (checkPkg.stdout ?? '').trim() === 'yes';

  if (!hasPkg) {
    // Try pytest for Python
    try {
      const result = await ctx.sandbox.commands.run(
        `cd "${ctx.repoDir}" && python -m pytest --tb=short -q`,
        { timeoutMs: 120_000 },
      );
      const out = result.stdout ?? '';
      ctx.logs.push(`[test] ${out.slice(-2000)}`);
      return { success: result.exitCode === 0, output: out };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, output: msg };
    }
  }

  const pkgResult = await ctx.sandbox.commands.run(`cat "${ctx.repoDir}/package.json"`);
  let scripts: Record<string, string> = {};
  try {
    scripts = JSON.parse(pkgResult.stdout ?? '{}').scripts ?? {};
  } catch { /* ignore */ }

  let cmd: string | null = null;
  if (scripts['test']) cmd = 'npm test -- --passWithNoTests';
  else if (scripts['build']) cmd = 'npm run build';

  if (!cmd) {
    ctx.logs.push('[test/build] No test or build script found.');
    return { success: true, output: 'No test/build script.' };
  }

  try {
    const result = await ctx.sandbox.commands.run(
      `cd "${ctx.repoDir}" && ${cmd}`,
      { timeoutMs: 120_000 },
    );
    const out = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    ctx.logs.push(`[test/build] ${out.slice(-2000)}`);
    return { success: result.exitCode === 0, output: out };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, output: msg };
  }
}

export async function destroySandbox(ctx: SandboxContext): Promise<void> {
  try {
    await ctx.sandbox.kill();
    logger.info('E2B sandbox destroyed', { sandboxId: ctx.sandboxId });
    ctx.logs.push(`[sandbox] Destroyed: ${ctx.sandboxId}`);
  } catch (err: unknown) {
    logger.warn('Failed to destroy E2B sandbox', {
      sandboxId: ctx.sandboxId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
