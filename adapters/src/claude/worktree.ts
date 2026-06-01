import { promises as fs } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import type { StageName } from '@skipper/core';

const exec = promisify(execFile);

export interface WorktreeInfo {
  path: string;
  branch: string;
  cleanup: () => Promise<void>;
}

/**
 * Derive a git branch name from a sprint ID and stage.
 * e.g. sprintId='sprint-01', stage='build' → 'skipper/sprint-01-build'
 */
function branchName(sprintId: string, stage: StageName): string {
  return `skipper/${sprintId}-${stage}`;
}

/**
 * Derive the worktree filesystem path.
 * Worktrees live at <repoPath>/.skipper/worktrees/<branch-slug>
 * where branch-slug replaces '/' with '-' to avoid path confusion.
 */
function worktreePath(repoPath: string, branch: string): string {
  const slug = branch.replace(/\//g, '-');
  return path.join(repoPath, '.skipper', 'worktrees', slug);
}

/**
 * Create an isolated git worktree for the coder persona.
 *
 * The worktree is created at <repoPath>/.skipper/worktrees/skipper-<sprintId>-<stage>
 * on a new branch named 'skipper/<sprintId>-<stage>'.
 *
 * If git is unavailable or the directory is not a git repository, returns a
 * WorktreeInfo that points to repoPath itself with a no-op cleanup — the coder
 * will work directly in the repo root without isolation.
 */
export async function createWorktree(
  repoPath: string,
  sprintId: string,
  stage: StageName,
): Promise<WorktreeInfo> {
  const branch = branchName(sprintId, stage);
  const wtPath = worktreePath(repoPath, branch);

  try {
    // Verify git is available and repoPath is a git repo.
    await exec('git', ['-C', repoPath, 'rev-parse', '--git-dir']);

    // Ensure the parent directory exists.
    await fs.mkdir(path.dirname(wtPath), { recursive: true });

    // Create the worktree on a new branch.
    await exec('git', ['-C', repoPath, 'worktree', 'add', wtPath, '-b', branch]);

    const cleanup = async (): Promise<void> => {
      await removeWorktree(repoPath, wtPath);
    };

    return { path: wtPath, branch, cleanup };
  } catch {
    // Graceful fallback: return repo root with no-op cleanup.
    return {
      path: repoPath,
      branch,
      cleanup: async () => {},
    };
  }
}

/**
 * Remove an existing git worktree and delete its branch.
 *
 * Errors are swallowed — this is best-effort cleanup. Callers should not
 * depend on the worktree being absent after this call (e.g. if the process
 * was killed before cleanup ran, a future sprint will handle stale worktrees).
 */
export async function removeWorktree(
  repoPath: string,
  worktreePath: string,
): Promise<void> {
  try {
    await exec('git', ['-C', repoPath, 'worktree', 'remove', '--force', worktreePath]);
  } catch {
    // Best-effort; directory may already be gone or never created.
  }

  // Determine the branch name from the worktree directory name.
  // We reverse the slug transformation applied in branchName/worktreePath.
  const slug = path.basename(worktreePath);
  // slug format: 'skipper-<sprintId>-<stage>', original branch: 'skipper/<sprintId>-<stage>'
  // We only restore the first '-' → '/' since the branch prefix is always 'skipper/'.
  const branch = slug.replace(/^skipper-/, 'skipper/');

  try {
    await exec('git', ['-C', repoPath, 'branch', '-D', branch]);
  } catch {
    // Branch may not exist or may have been deleted already.
  }
}
