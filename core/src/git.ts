import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execFile = promisify(execFileCb);

export interface SprintWorktree {
  path: string;
  branch: string;
}

/** Run `git` with explicit args (no shell) and return stdout. */
async function git(repoPath: string, args: string[]): Promise<string> {
  const { stdout } = await execFile('git', ['-C', repoPath, ...args], {
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
}

export async function isGitRepo(repoPath: string): Promise<boolean> {
  try {
    await git(repoPath, ['rev-parse', '--git-dir']);
    return true;
  } catch {
    return false;
  }
}

/** True when HEAD has at least one commit (a branch can be created from it). */
async function hasCommits(repoPath: string): Promise<boolean> {
  try {
    await git(repoPath, ['rev-parse', 'HEAD']);
    return true;
  } catch {
    return false;
  }
}

async function branchExists(repoPath: string, branch: string): Promise<boolean> {
  try {
    await git(repoPath, ['rev-parse', '--verify', `refs/heads/${branch}`]);
    return true;
  } catch {
    return false;
  }
}

export function sprintBranch(sprintId: string): string {
  return `skipper/${sprintId}`;
}

export function sprintWorktreePath(repoPath: string, sprintId: string): string {
  return path.join(repoPath, '.skipper', 'worktrees', sprintId);
}

/**
 * Ensure a per-sprint worktree exists at .skipper/worktrees/<sprintId> on branch
 * skipper/<sprintId>, branched from current HEAD. Idempotent — reuses an existing
 * worktree/branch. Returns null when the worktree cannot be created (not a git
 * repo, or no commits to branch from); callers degrade to the repo root.
 */
export async function ensureSprintWorktree(
  repoPath: string,
  sprintId: string,
): Promise<SprintWorktree | null> {
  if (!(await isGitRepo(repoPath)) || !(await hasCommits(repoPath))) return null;

  const branch = sprintBranch(sprintId);
  const wtPath = sprintWorktreePath(repoPath, sprintId);

  // Already registered as a worktree → reuse.
  try {
    const list = await git(repoPath, ['worktree', 'list', '--porcelain']);
    if (list.includes(wtPath)) return { path: wtPath, branch };
  } catch {
    /* fall through to creation */
  }

  try {
    if (await branchExists(repoPath, branch)) {
      await git(repoPath, ['worktree', 'add', wtPath, branch]);
    } else {
      await git(repoPath, ['worktree', 'add', wtPath, '-b', branch]);
    }
    return { path: wtPath, branch };
  } catch {
    return null;
  }
}

export interface CommitResult {
  committed: boolean;
  sha?: string;
}

/**
 * Stage and commit everything in a worktree. Returns committed=false (without
 * error) when there is nothing to commit.
 */
export async function commitAll(
  worktreePath: string,
  message: string,
): Promise<CommitResult> {
  await git(worktreePath, ['add', '-A']);
  const status = await git(worktreePath, ['status', '--porcelain']);
  if (status.trim() === '') return { committed: false };
  await git(worktreePath, ['commit', '-m', message, '--no-verify']);
  const sha = (await git(worktreePath, ['rev-parse', 'HEAD'])).trim();
  return { committed: true, sha };
}

/**
 * Merge a branch into the repo's current branch (expected to be the default
 * branch in the repo root) with a merge commit. Returns the merge stdout.
 */
export async function mergeBranch(
  repoPath: string,
  branch: string,
  message: string,
): Promise<string> {
  return git(repoPath, ['merge', '--no-ff', branch, '-m', message]);
}

/** Best-effort: remove a worktree directory (does not delete the branch). */
export async function removeWorktree(repoPath: string, worktreePath: string): Promise<void> {
  try {
    await git(repoPath, ['worktree', 'remove', '--force', worktreePath]);
  } catch {
    /* already gone */
  }
}

/** Best-effort: delete a branch (use after it has been merged). */
export async function deleteBranch(repoPath: string, branch: string): Promise<void> {
  try {
    await git(repoPath, ['branch', '-D', branch]);
  } catch {
    /* already gone */
  }
}
