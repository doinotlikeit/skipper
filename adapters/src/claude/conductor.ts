import { promises as fs } from 'fs';
import path from 'path';
import type {
  Sprint,
  PersonaRole,
  PersonaAdapter,
  ConductorAdapter,
  RunEvent,
  StageTask,
  Workspace,
  ProjectContext,
  SignoffRequest,
  Question,
} from '@skipper/core';
import { SIGNOFF_GATES } from '@skipper/core';
import type { ClaudePersonaOptions } from './persona.js';

export class ClaudeConductorAdapter implements ConductorAdapter {
  constructor(
    private readonly personas: Map<PersonaRole, PersonaAdapter>,
    private readonly opts?: ClaudePersonaOptions,
  ) {}

  async *drive(sprint: Sprint, ctx: ProjectContext): AsyncIterable<RunEvent> {
    const currentStage = sprint.stages.find((s) => s.status === 'in_progress');
    if (!currentStage) return;

    const role = currentStage.owner as PersonaRole;
    const persona = this.personas.get(role);

    if (!persona) {
      yield {
        type: 'error',
        sprint: sprint.id,
        stage: currentStage.name,
        data: `No persona adapter registered for role: ${role}`,
      };
      return;
    }

    yield {
      type: 'progress',
      sprint: sprint.id,
      stage: currentStage.name,
      data: `${role} starting work on stage "${currentStage.name}"`,
    };

    const stageTask: StageTask = {
      sprint,
      stage: currentStage.name,
      context: ctx,
    };

    const workspace: Workspace = {
      repoPath: ctx.repoPath,
      sprint,
      stage: currentStage.name,
    };

    const result = await persona.run(stageTask, workspace);

    if (ctx.stateOps && result.success) {
      const artifactRef = `artifacts/${sprint.id}/${currentStage.name}-output.md`;
      const artifactPath = path.join(ctx.repoPath, '.skipper', artifactRef);

      await fs.mkdir(path.dirname(artifactPath), { recursive: true });
      await fs.writeFile(artifactPath, result.output, 'utf-8');

      await ctx.stateOps.recordArtifact(
        sprint.id,
        currentStage.name,
        artifactRef,
        `${currentStage.name} output`,
      );

      // Stages listed in SIGNOFF_GATES require a human sign-off before the
      // runner advances to the next stage.
      if (SIGNOFF_GATES.includes(currentStage.name)) {
        await ctx.stateOps.requestSignoff(
          sprint.id,
          currentStage.name,
          `Review ${artifactRef} and approve to continue`,
        );
      }
    }

    yield {
      type: result.success ? 'done' : 'error',
      sprint: sprint.id,
      stage: currentStage.name,
      data: result.success
        ? `Stage "${currentStage.name}" complete`
        : result.output,
    };
  }

  async ask(request: SignoffRequest | Question): Promise<void> {
    // V1: log to stdout so the human can read the inbox and act via CLI.
    const detail =
      'reason' in request
        ? request.reason
        : request.text;
    console.log(`[Skipper] Sign-off/question: ${detail}`);
  }
}
