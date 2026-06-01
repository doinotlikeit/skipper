import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { promises as fs } from 'fs';
import path from 'path';
import type {
  Sprint,
  Stage,
  StageName,
  SkipperEvent,
  SignoffRequest,
  Initiative,
  Task,
  CheckResult,
  DeployResult,
  PersonaRole,
  AdapterSeam,
  AdapterInfo,
  EventFilter,
  AgentResult,
  ProjectContext,
  StateOps,
  Workspace,
  StageTask,
  SkipperConfig,
  RunOptions,
  RunEvent,
} from './types.js';
import { SIGNOFF_GATES, STAGE_ORDER } from './types.js';
import type { AdapterSet } from './adapters/interfaces.js';
import { FileState } from './state/index.js';
import { SprintRunner } from './runner/index.js';
import type { AdvanceResult } from './runner/index.js';

export class Core {
  readonly eventEmitter: EventEmitter;
  private readonly runner: SprintRunner;
  private _config: SkipperConfig | null = null;

  constructor(
    readonly state: FileState,
    readonly adapters: AdapterSet,
  ) {
    this.eventEmitter = new EventEmitter();
    this.runner = new SprintRunner(state, adapters);

    // Patch state.appendEvent to emit on eventEmitter after each write
    const origAppend = this.state.appendEvent.bind(this.state);
    this.state.appendEvent = async (event: Omit<SkipperEvent, 'ts'>) => {
      await origAppend(event);
      const fullEvent: SkipperEvent = { ...event, ts: new Date().toISOString() };
      this.eventEmitter.emit('event', fullEvent);
    };
  }

  // ── Project ────────────────────────────────────────────────────────────────

  async initProject(repoPath: string): Promise<void> {
    const s = new FileState(repoPath);
    await s.init();
  }

  async attachProject(repoPath: string): Promise<void> {
    const s =
      repoPath === this.state.repoPath ? this.state : new FileState(repoPath);
    await s.init();

    const sprints = await s.listSprints();
    const activeSprint = sprints.find(sp =>
      sp.stages.some(st => st.status === 'in_progress'),
    );
    if (!activeSprint) return;

    const ctx: ProjectContext = {
      repoPath,
      understanding: await s.readUnderstanding(),
    };

    // Consume conductor events — side effects are the conductor's responsibility
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ev of this.adapters.conductor.drive(activeSprint, ctx)) {
      // events consumed; conductor drives externally
    }
  }

  async getProjectStatus(): Promise<{
    repoPath: string;
    sprints: number;
    activeSprint: Sprint | null;
  }> {
    const sprints = await this.state.listSprints();
    const activeSprint =
      sprints.find(s => s.stages.some(st => st.status === 'in_progress')) ?? null;
    return { repoPath: this.state.repoPath, sprints: sprints.length, activeSprint };
  }

  // ── Roadmap ────────────────────────────────────────────────────────────────

  async getRoadmap(): Promise<Initiative[]> {
    return this.adapters.roadmap.listInitiatives();
  }

  async addInitiative(text: string): Promise<Initiative> {
    return this.adapters.roadmap.addInitiative(text);
  }

  // ── Sprints ────────────────────────────────────────────────────────────────

  async planSprint(goal: string, roadmapRef?: string): Promise<Sprint> {
    return this.runner.createSprint(goal, roadmapRef);
  }

  async getSprint(id: string): Promise<Sprint> {
    return this.state.readSprint(id);
  }

  async listSprints(): Promise<Sprint[]> {
    return this.state.listSprints();
  }

  async getSprintStatus(
    id: string,
  ): Promise<{ sprint: Sprint; currentStage: Stage | null }> {
    const sprint = await this.state.readSprint(id);
    const currentStage = this.runner.getCurrentStage(sprint);
    return { sprint, currentStage };
  }

  async advanceSprint(id: string, toStage?: StageName): Promise<AdvanceResult> {
    return this.runner.advance(id, toStage);
  }

  // ── Tasks ──────────────────────────────────────────────────────────────────

  async listTasks(sprintId?: string): Promise<Task[]> {
    if (sprintId) {
      return this.adapters.workboard.listTasks(sprintId);
    }
    const sprints = await this.state.listSprints();
    const allTasks: Task[] = [];
    for (const sprint of sprints) {
      const tasks = await this.adapters.workboard.listTasks(sprint.id);
      allTasks.push(...tasks);
    }
    return allTasks;
  }

  async getTask(taskId: string): Promise<Task> {
    const tasks = await this.listTasks();
    const task = tasks.find(t => t.id === taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    return task;
  }

  async moveTask(taskId: string, toStage: StageName): Promise<void> {
    await this.adapters.workboard.moveTask(taskId, toStage);
  }

  // ── Sign-offs ──────────────────────────────────────────────────────────────

  async listPendingSignoffs(): Promise<SignoffRequest[]> {
    return this.state.listPendingSignoffRequests();
  }

  async approveSignoff(
    signoffRequestId: string,
    actor: string,
    note?: string,
  ): Promise<void> {
    const events = await this.state.readEvents({ type: 'signoff_request' });
    const request = events.find(e => e.ref === signoffRequestId);
    if (!request) {
      throw new Error(`Sign-off request not found: ${signoffRequestId}`);
    }
    await this.state.recordSignOff({
      sprint: request.sprint,
      stage: request.stage,
      actor,
      note,
    });
  }

  async rejectSignoff(
    signoffRequestId: string,
    actor: string,
    note?: string,
  ): Promise<void> {
    const events = await this.state.readEvents({ type: 'signoff_request' });
    const request = events.find(e => e.ref === signoffRequestId);
    if (!request) {
      throw new Error(`Sign-off request not found: ${signoffRequestId}`);
    }
    await this.state.appendEvent({
      actor,
      sprint: request.sprint,
      stage: request.stage,
      type: 'message',
      ref: signoffRequestId,
      note: note ?? 'Sign-off rejected',
    });
  }

  // ── Events ─────────────────────────────────────────────────────────────────

  async getEvents(filter?: EventFilter): Promise<SkipperEvent[]> {
    return this.state.readEvents(filter);
  }

  // ── Checks ─────────────────────────────────────────────────────────────────

  async runCheck(name: string): Promise<CheckResult> {
    const check = this.adapters.checks.find(c => c.name === name);
    if (!check) {
      throw new Error(`Check adapter not found: ${name}`);
    }

    const workspace = await this.activeWorkspace();
    const result = await check.run(workspace);

    await this.state.appendEvent({
      actor: 'system',
      sprint: workspace.sprint.id,
      stage: workspace.stage,
      type: 'check',
      ref: name,
      note: JSON.stringify(result),
    });

    return result;
  }

  // ── Deploy ─────────────────────────────────────────────────────────────────

  async deploy(sprintId: string): Promise<DeployResult> {
    const sprint = await this.state.readSprint(sprintId);
    const activeStageEntry =
      sprint.stages.find(s => s.status === 'in_progress') ??
      sprint.stages[sprint.stages.length - 1];

    const workspace: Workspace = {
      repoPath: this.state.repoPath,
      sprint,
      stage: activeStageEntry.name,
    };

    const plan = await this.adapters.deploy.plan(workspace);
    const result = await this.adapters.deploy.execute(plan);

    await this.state.appendEvent({
      actor: 'system',
      sprint: sprintId,
      stage: activeStageEntry.name,
      type: 'artifact',
      ref: 'deploy-result',
      note: JSON.stringify(result),
    });

    return result;
  }

  // ── Adapters ───────────────────────────────────────────────────────────────

  listAdapters(): AdapterInfo[] {
    const cfg = this._config;
    const usingClaude = !!process.env['ANTHROPIC_API_KEY'] || cfg?.adapters.conductor === 'claude';

    const knownBySeam: Record<AdapterSeam, string[]> = {
      roadmap: ['markdown', 'stub'],
      workboard: ['markdown', 'stub', 'linear', 'github'],
      conductor: ['stub', 'claude', 'hermes'],
      persona: ['stub', 'claude'],
      check: ['stub', 'eslint', 'vitest', 'tsc'],
      deploy: ['stub', 'docker', 'k8s'],
    };

    const conductorImpl = usingClaude ? 'claude' : (cfg?.adapters.conductor ?? 'stub');
    const personaImpl = usingClaude ? 'claude' : (cfg?.adapters.persona ?? 'stub');

    if (!cfg) {
      return Object.entries(knownBySeam).map(([seam, available]) => ({
        seam: seam as AdapterSeam,
        impl: seam === 'conductor' ? conductorImpl : seam === 'persona' ? personaImpl : available[0],
        available,
      }));
    }

    return [
      { seam: 'roadmap', impl: cfg.adapters.roadmap, available: knownBySeam.roadmap },
      { seam: 'workboard', impl: cfg.adapters.workboard, available: knownBySeam.workboard },
      { seam: 'conductor', impl: conductorImpl, available: knownBySeam.conductor },
      { seam: 'persona', impl: personaImpl, available: knownBySeam.persona },
      { seam: 'check', impl: cfg.adapters.check.join(','), available: knownBySeam.check },
      { seam: 'deploy', impl: cfg.adapters.deploy, available: knownBySeam.deploy },
    ];
  }

  async setAdapter(seam: AdapterSeam, impl: string): Promise<void> {
    if (!this._config) {
      this._config = await this.state.readConfig();
    }
    if (seam === 'check') {
      this._config.adapters.check = [impl];
    } else if (seam !== 'persona') {
      (this._config.adapters as Record<string, unknown>)[seam] = impl;
    } else {
      this._config.adapters.persona = impl;
    }
    await this.state.writeConfig(this._config);
  }

  // ── Agent ──────────────────────────────────────────────────────────────────

  async runAgent(role: PersonaRole, task: string): Promise<AgentResult> {
    const persona = this.adapters.persona.get(role);
    if (!persona) {
      throw new Error(`No persona adapter registered for role: ${role}`);
    }

    const workspace = await this.activeWorkspace();

    const stageTask: StageTask = {
      sprint: workspace.sprint,
      stage: workspace.stage,
      context: {
        repoPath: this.state.repoPath,
        understanding: await this.state.readUnderstanding(),
      },
    };

    const result = await persona.run(stageTask, workspace);

    return { role, task, output: result.output, success: result.success };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Load config once and cache it, for use by listAdapters(). */
  async loadConfig(): Promise<void> {
    this._config = await this.state.readConfig();
  }

  private async activeWorkspace(): Promise<Workspace> {
    const sprints = await this.state.listSprints();
    const activeSprint = sprints.find(s =>
      s.stages.some(st => st.status === 'in_progress'),
    );
    if (!activeSprint) {
      throw new Error('No active sprint found');
    }
    const activeStageEntry = activeSprint.stages.find(
      s => s.status === 'in_progress',
    )!;
    return {
      repoPath: this.state.repoPath,
      sprint: activeSprint,
      stage: activeStageEntry.name,
    };
  }

  // ── Sprint orchestration loop ───────────────────────────────────────────────

  // Drive the sprint: invoke conductor for the current stage, then try to
  // advance the gate. Repeats until blocked at a sign-off gate, escalated,
  // or the sprint is complete. Yields RunEvents for CLI --watch / WS streaming.
  async *runSprint(sprintId: string, opts?: RunOptions): AsyncIterable<RunEvent> {
    while (true) {
      const sprint = await this.state.readSprint(sprintId);
      const currentStage = this.runner.getCurrentStage(sprint);

      if (!currentStage) {
        yield { type: 'done', sprint: sprintId, data: 'Sprint complete' };
        break;
      }

      if (currentStage.status === 'escalated') {
        yield { type: 'message', sprint: sprintId, stage: currentStage.name, data: 'Stage escalated — human action required' };
        break;
      }

      // If a stage filter is set, only run that specific stage
      if (opts?.stage && currentStage.name !== opts.stage) {
        const currentIdx = STAGE_ORDER.indexOf(currentStage.name);
        const targetIdx = STAGE_ORDER.indexOf(opts.stage);
        if (currentIdx > targetIdx) {
          yield { type: 'message', sprint: sprintId, data: `Stage '${opts.stage}' is already complete` };
        } else {
          yield { type: 'message', sprint: sprintId, data: `Stage '${opts.stage}' not yet reached; current stage is '${currentStage.name}'` };
        }
        break;
      }

      // For sign-off gate stages: if the sign-off is already approved, advance without
      // re-driving the conductor (avoids duplicate work on re-runs after human approval).
      const isSignoffGate = SIGNOFF_GATES.includes(currentStage.name as typeof SIGNOFF_GATES[number]);
      if (isSignoffGate) {
        const fastResult = await this.runner.advance(sprintId);
        if (fastResult.ok) {
          yield { type: 'progress', sprint: sprintId, data: { from: fastResult.from, to: fastResult.to } };
          if (opts?.stage) break;
          continue;
        }
        // Sign-off not yet given — drive the conductor so it can request one, then stop.
      }

      const ctx: ProjectContext = {
        repoPath: this.state.repoPath,
        understanding: await this.state.readUnderstanding().catch(() => ''),
        stateOps: this.makeStateOps(sprintId),
      };

      yield { type: 'progress', sprint: sprintId, stage: currentStage.name, data: `${currentStage.owner} working on ${currentStage.name}` };

      for await (const event of this.adapters.conductor.drive(sprint, ctx)) {
        yield event;
        if (event.type === 'error') {
          return; // abort on conductor error
        }
      }

      if (isSignoffGate) {
        yield {
          type: 'message',
          sprint: sprintId,
          stage: currentStage.name,
          data: `Sign-off required for '${currentStage.name}'. Run: skipper signoff list`,
        };
        break;
      }

      // Advance to the next stage
      const result = await this.runner.advance(sprintId);
      if (!result.ok) {
        yield { type: 'message', sprint: sprintId, data: result.reason };
        if (result.escalated) break;
        break;
      }

      yield { type: 'progress', sprint: sprintId, data: { from: result.from, to: result.to } };

      if (result.to === 'complete') {
        yield { type: 'done', sprint: sprintId, data: 'Sprint complete' };
        break;
      }

      // If a stage filter was set, stop after completing that stage
      if (opts?.stage) break;
    }
  }

  // Minimal bridge for conductor/personas to record events via Core
  private makeStateOps(sprintId: string): StateOps {
    return {
      recordArtifact: async (sprint, stage, ref, note) => {
        const dir = path.join(this.state.skipperDir, 'artifacts', sprint);
        await fs.mkdir(dir, { recursive: true });
        await this.state.appendEvent({ actor: 'system', sprint, stage, type: 'artifact', ref, note });
      },
      requestSignoff: async (sprint, stage, reason) => {
        const id = uuidv4();
        await this.state.appendEvent({ actor: 'system', sprint, stage, type: 'signoff_request', ref: id, note: reason });
        return id;
      },
      postMessage: async (sprint, stage, actor, note) => {
        await this.state.appendEvent({ actor, sprint, stage, type: 'message', note });
      },
      recordCheckResult: async (sprint, stage, name, passed, output) => {
        await this.state.appendEvent({
          actor: 'system',
          sprint,
          stage,
          type: 'check',
          ref: name,
          note: JSON.stringify({ name, passed, output }),
        });
      },
    };
  }
}

export type { AdvanceResult };
