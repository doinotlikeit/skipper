import { spawn } from 'child_process';
import type {
  PersonaRole,
  PersonaAdapter,
  StageTask,
  StageResult,
  Workspace,
} from '@skipper/core';
import { SYSTEM_PROMPTS } from '../claude/prompts.js';
import { buildUserMessage } from '../claude/persona.js';

export interface ClaudeCodeOptions {
  /** Model passed to `claude --model`. Default: 'claude-sonnet-4-6'. */
  model?: string;
  /**
   * Model for the reviewer/verifier persona. Must differ from the coder's so
   * the review is independent (spec/08). Default: 'claude-opus-4-7'.
   */
  verifierModel?: string;
}

/**
 * Persona backed by the locally-installed Claude Code CLI. Each stage shells out
 * to `claude -p` (headless print mode), running in the persona's git worktree
 * for the build stage so real edits land on an isolated branch. The CLI's JSON
 * result is captured as the stage output; exit code drives success/failure.
 *
 * This is the default backend (spec/04) and the one that lets Skipper produce
 * real diffs — closing the self-hosting loop.
 */
export class ClaudeCodePersonaAdapter implements PersonaAdapter {
  readonly role: PersonaRole;
  private readonly model: string;

  constructor(role: PersonaRole, opts?: ClaudeCodeOptions) {
    this.role = role;
    this.model =
      role === 'reviewer'
        ? (opts?.verifierModel ?? 'claude-opus-4-7')
        : (opts?.model ?? 'claude-sonnet-4-6');
  }

  async run(task: StageTask, workspace: Workspace): Promise<StageResult> {
    const systemPrompt = SYSTEM_PROMPTS[task.stage] ?? '';
    const userMessage = await buildUserMessage(task, workspace);

    // Run in the sprint worktree when Core provides one (build/check/ship), so
    // edits land on the sprint branch. Core owns the worktree lifecycle — this
    // adapter neither creates nor destroys it. Falls back to the repo root.
    const cwd = workspace.worktreePath ?? workspace.repoPath;

    const args = ['-p', userMessage, '--output-format', 'json', '--model', this.model];
    if (systemPrompt) {
      args.push('--append-system-prompt', systemPrompt);
    }
    // Only the build stage edits files; let it do so without interactive prompts
    // (safe because it runs in an isolated, Core-managed worktree).
    if (task.stage === 'build') {
      args.push('--permission-mode', 'acceptEdits');
    }

    try {
      const { code, stdout, stderr } = await runClaude(args, cwd);

      if (code !== 0) {
        return {
          success: false,
          output: (stderr || stdout || `claude exited with code ${code}`).trim(),
        };
      }

      // `--output-format json` prints a single JSON object with a `result` field.
      let output = stdout;
      try {
        const parsed = JSON.parse(stdout) as { result?: string };
        if (typeof parsed.result === 'string') output = parsed.result;
      } catch {
        // Not JSON (older CLI or text fallback) — keep raw stdout.
      }

      return { success: true, output: output.trim() };
    } catch (err: unknown) {
      return {
        success: false,
        output: `Failed to run Claude Code CLI: ${(err as Error).message}`,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// runClaude — spawn the CLI, capture stdout/stderr and the exit code.
// argv is passed directly (no shell) so a multi-KB prompt arg is safe.
// ---------------------------------------------------------------------------

function runClaude(
  args: string[],
  cwd: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', args, { cwd });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}
