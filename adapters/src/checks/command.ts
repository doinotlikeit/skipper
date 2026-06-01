import { promises as fs } from 'fs';
import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import type { CheckAdapter, CheckResult, Workspace } from '@skipper/core';

const exec = promisify(execCb);

/**
 * The directory a check should run in: the persona's isolated worktree if one
 * exists, otherwise the repo root.
 */
function workdir(workspace: Workspace): string {
  return workspace.worktreePath ?? workspace.repoPath;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Run a shell command in a directory and reduce it to a CheckResult.
 * Exit code 0 → passed; any non-zero exit (or spawn failure) → failed, with the
 * combined stdout/stderr captured as evidence in the event log.
 */
async function runCommand(name: string, command: string, cwd: string): Promise<CheckResult> {
  const ts = new Date().toISOString();
  try {
    const { stdout, stderr } = await exec(command, { cwd, maxBuffer: 10 * 1024 * 1024 });
    return { name, passed: true, output: `$ ${command}\n${stdout}${stderr}`.trim(), ts };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const output = `$ ${command}\n${e.stdout ?? ''}${e.stderr ?? ''}`.trim() || (e.message ?? 'command failed');
    return { name, passed: false, output, ts };
  }
}

/**
 * A check backed by a concrete shell command. Passes iff the command exits 0.
 */
export class CommandCheckAdapter implements CheckAdapter {
  constructor(
    public readonly name: string,
    private readonly command: string,
  ) {}

  async run(workspace: Workspace): Promise<CheckResult> {
    return runCommand(this.name, this.command, workdir(workspace));
  }
}

/**
 * Detect the package manager from lockfiles, defaulting to npm.
 */
async function detectPackageManager(dir: string): Promise<'pnpm' | 'yarn' | 'npm'> {
  if (await fileExists(path.join(dir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (await fileExists(path.join(dir, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

/**
 * The `tests` check: runs the project's test command. For a Node project it
 * detects the package manager and runs its `test` script when one is declared.
 * Repos with no recognizable test command pass with an explanatory note rather
 * than blocking the gate — a missing test runner is not a failing test.
 */
export class TestsCheckAdapter implements CheckAdapter {
  readonly name = 'tests';

  async run(workspace: Workspace): Promise<CheckResult> {
    const cwd = workdir(workspace);
    const ts = new Date().toISOString();
    const pkgPath = path.join(cwd, 'package.json');

    if (await fileExists(pkgPath)) {
      const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8')) as { scripts?: Record<string, string> };
      if (pkg.scripts?.['test']) {
        const pm = await detectPackageManager(cwd);
        const cmd = pm === 'npm' ? 'npm test' : `${pm} test`;
        return runCommand(this.name, cmd, cwd);
      }
    }

    return {
      name: this.name,
      passed: true,
      output: 'no test command detected (no package.json test script); skipping',
      ts,
    };
  }
}

/**
 * The `security` check: runs a dependency vulnerability audit. For a Node
 * project with a manifest it runs `npm audit` and fails on high/critical
 * advisories. Repos without a manifest pass with an explanatory note.
 */
export class SecurityCheckAdapter implements CheckAdapter {
  readonly name = 'security';

  async run(workspace: Workspace): Promise<CheckResult> {
    const cwd = workdir(workspace);
    const ts = new Date().toISOString();

    if (await fileExists(path.join(cwd, 'package.json'))) {
      // `npm audit` exits non-zero when advisories at/above the level are found.
      return runCommand(this.name, 'npm audit --audit-level=high', cwd);
    }

    return {
      name: this.name,
      passed: true,
      output: 'no dependency manifest detected; no dependency audit run',
      ts,
    };
  }
}
