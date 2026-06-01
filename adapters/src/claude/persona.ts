import { promises as fs } from 'fs';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import type {
  PersonaRole,
  PersonaAdapter,
  StageTask,
  StageResult,
  Workspace,
} from '@skipper/core';
import { SYSTEM_PROMPTS } from './prompts.js';
import { createWorktree } from './worktree.js';

export interface ClaudePersonaOptions {
  /** Primary model for most personas. Default: 'claude-sonnet-4-6' */
  model?: string;
  /**
   * Model used for the reviewer persona. Must differ from the coder's model so
   * that the reviewer provides an independent perspective.
   * Default: 'claude-opus-4-7'
   */
  verifierModel?: string;
  /** Maximum tokens in the completion. Default: 8192 */
  maxTokens?: number;
}

export class ClaudePersonaAdapter implements PersonaAdapter {
  readonly role: PersonaRole;
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(role: PersonaRole, opts?: ClaudePersonaOptions) {
    this.role = role;
    this.client = new Anthropic(); // reads ANTHROPIC_API_KEY from environment
    this.model =
      role === 'reviewer'
        ? (opts?.verifierModel ?? 'claude-opus-4-7')
        : (opts?.model ?? 'claude-sonnet-4-6');
    this.maxTokens = opts?.maxTokens ?? 8192;
  }

  async run(task: StageTask, workspace: Workspace): Promise<StageResult> {
    const systemPrompt = SYSTEM_PROMPTS[task.stage];
    const userMessage = await buildUserMessage(task, workspace);

    // For the 'build' stage, create an isolated git worktree so the coder's
    // changes stay separate from the main working tree.
    let actualWorkspace = workspace;
    let worktreeCleanup: (() => Promise<void>) | null = null;

    if (task.stage === 'build') {
      try {
        const wt = await createWorktree(
          workspace.repoPath,
          task.sprint.id,
          task.stage,
        );
        actualWorkspace = { ...workspace, worktreePath: wt.path };
        worktreeCleanup = wt.cleanup;
      } catch {
        // Graceful fallback: work directly in the repo root.
        // createWorktree itself shouldn't throw (it has its own try/catch),
        // but guard here in case of an unexpected failure.
      }
    }

    // Suppress unused-variable lint warning — actualWorkspace carries the
    // worktreePath for the conductor/future tools that need it. We pass it
    // through to preserve the interface contract even though the current
    // Claude text-only call doesn't open files directly.
    void actualWorkspace;

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });

      const output = response.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as { type: 'text'; text: string }).text)
        .join('\n');

      return { success: true, output };
    } catch (err: unknown) {
      return {
        success: false,
        output: `Error calling Claude API: ${(err as Error).message}`,
      };
    } finally {
      if (worktreeCleanup) {
        await worktreeCleanup().catch(() => {});
      }
    }
  }
}

// ---------------------------------------------------------------------------
// buildUserMessage
// ---------------------------------------------------------------------------

/**
 * Construct the user-facing prompt for a persona invocation.
 *
 * Includes, in order:
 *   1. Sprint goal and current stage
 *   2. Project understanding (understanding.md) if present
 *   3. All prior artifacts for this sprint (inlined verbatim)
 *   4. The specific instruction for this stage
 */
export async function buildUserMessage(
  task: StageTask,
  workspace: Workspace,
): Promise<string> {
  const sections: string[] = [];

  // --- Sprint and stage context ---
  sections.push(`# Sprint: ${task.sprint.id}`);
  sections.push(`**Goal**: ${task.sprint.goal}`);
  sections.push(`**Current stage**: ${task.stage}`);

  if (task.sprint.roadmap_ref) {
    sections.push(`**Roadmap reference**: ${task.sprint.roadmap_ref}`);
  }

  // --- Project understanding ---
  const understanding = task.context.understanding;
  if (understanding && understanding.trim().length > 0) {
    sections.push('');
    sections.push('# Project Understanding');
    sections.push(understanding.trim());
  } else {
    // Attempt to read understanding.md from disk if the context didn't include it.
    const understandingPath = path.join(
      workspace.repoPath,
      '.skipper',
      'artifacts',
      'understanding.md',
    );
    const understandingFromDisk = await tryReadFile(understandingPath);
    if (understandingFromDisk) {
      sections.push('');
      sections.push('# Project Understanding');
      sections.push(understandingFromDisk.trim());
    }
  }

  // --- Prior sprint artifacts ---
  const artifacts = await loadSprintArtifacts(workspace.repoPath, task.sprint.id);
  if (artifacts.length > 0) {
    sections.push('');
    sections.push('# Prior Artifacts for This Sprint');
    for (const { name, content } of artifacts) {
      sections.push('');
      sections.push(`## ${name}`);
      sections.push(content.trim());
    }
  }

  // --- Stage-specific instruction ---
  sections.push('');
  sections.push('# Your Task');
  sections.push(stageInstruction(task.stage, task.sprint.goal));

  return sections.join('\n');
}

/**
 * Return the stage-specific instruction that tells the persona exactly what
 * to produce. The system prompt already sets the persona's general behaviour;
 * this message provides the concrete, sprint-specific directive.
 */
function stageInstruction(stage: string, goal: string): string {
  switch (stage) {
    case 'intake':
      return `Analyze this repository and produce a complete understanding.md document covering
all six required sections for the sprint goal: "${goal}".
Be specific and cite file paths, function names, and concrete observations from the codebase.`;

    case 'adr':
      return `Write a complete Architecture Decision Record for the sprint goal: "${goal}".
Use the project understanding and any prior artifacts as context. Every acceptance criterion must
be precise and testable. Format the ADR exactly as specified in your system instructions.`;

    case 'plan':
      return `Break down the ADR above into a concrete task plan for the sprint goal: "${goal}".
Every acceptance criterion in the ADR must map to exactly one task. Include the dependency graph
and risk section. Follow the format specified in your system instructions precisely.`;

    case 'build':
      return `Implement the feature described in the ADR and task plan above.
Sprint goal: "${goal}".
Work precisely to the acceptance criteria. Write production-quality code and unit tests.
Produce the implementation summary as specified in your system instructions when done.`;

    case 'check':
      return `Review all code changes made during the build stage for the sprint goal: "${goal}".
Check for correctness bugs, unhandled errors, security issues, and performance problems.
Produce the structured findings report as specified in your system instructions, ending with an
explicit Pass or Fail verdict.`;

    case 'ship':
      return `Prepare the deployment plan and runbook for the sprint goal: "${goal}".
Use the ADR and build artifacts above to make the plan specific to these changes.
Produce all three required sections: Deployment Plan, Rollback Procedure, and Post-deploy
Monitoring Checklist, as specified in your system instructions.`;

    case 'watch':
      return `Evaluate the metrics and logs provided above for the canary deployment.
Sprint goal: "${goal}".
Apply the SLO thresholds from your system instructions unless the deployment plan specifies
different values. Produce your status report (HEALTHY, DEGRADED, or ROLLBACK) with full evidence
and a recommended action.`;

    case 'retro':
      return `Write the sprint retrospective for the sprint goal: "${goal}".
Review all artifacts from this sprint. Produce all four sections as specified in your system
instructions. The Learnings section will be appended to understanding.md — write it as a
standalone, self-contained section.`;

    default:
      return `Complete your assigned work for stage "${stage}" on sprint goal: "${goal}".
Follow the format specified in your system instructions.`;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Read a file and return its content, or null if the file does not exist or
 * cannot be read.
 */
async function tryReadFile(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

interface ArtifactEntry {
  name: string;
  content: string;
}

/**
 * Load all artifact files from .skipper/artifacts/<sprintId>/ and return them
 * sorted by filename so earlier stages appear before later ones.
 *
 * Files are inlined verbatim so the persona has full context from prior stages.
 */
async function loadSprintArtifacts(
  repoPath: string,
  sprintId: string,
): Promise<ArtifactEntry[]> {
  const artifactsDir = path.join(repoPath, '.skipper', 'artifacts', sprintId);

  let entries: string[];
  try {
    entries = await fs.readdir(artifactsDir);
  } catch {
    return [];
  }

  const results: ArtifactEntry[] = [];

  for (const entry of entries.sort()) {
    const filePath = path.join(artifactsDir, entry);
    let stat;
    try {
      stat = await fs.stat(filePath);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;

    const content = await tryReadFile(filePath);
    if (content !== null) {
      results.push({ name: entry, content });
    }
  }

  return results;
}
