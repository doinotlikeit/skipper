import { v4 as uuidv4 } from 'uuid';
import type {
  Initiative,
  Sprint,
  Task,
  StageName,
  StageStatus,
  PersonaRole,
  Workspace,
  StageTask,
  StageResult,
  RunEvent,
  SignoffRequest,
  CheckResult,
  DeployPlan,
  DeployResult,
  ProjectContext,
} from '@skipper/core';
import type {
  RoadmapAdapter,
  WorkBoardAdapter,
  ConductorAdapter,
  PersonaAdapter,
  CheckAdapter,
  DeployAdapter,
  AdapterSet,
} from '@skipper/core';
import { STAGE_ORDER, STAGE_OWNERS } from '@skipper/core';

// ---------------------------------------------------------------------------
// StubRoadmapAdapter
// ---------------------------------------------------------------------------

export class StubRoadmapAdapter implements RoadmapAdapter {
  private initiatives: Initiative[] = [];

  async listInitiatives(): Promise<Initiative[]> {
    return [...this.initiatives];
  }

  async addInitiative(text: string): Promise<Initiative> {
    const initiative: Initiative = {
      id: uuidv4(),
      text,
      sprint_refs: [],
    };
    this.initiatives.push(initiative);
    console.log(`[StubRoadmap] addInitiative: ${initiative.id} "${text}"`);
    return initiative;
  }

  async link(sprintId: string, initiativeId: string): Promise<void> {
    const initiative = this.initiatives.find((i) => i.id === initiativeId);
    if (initiative) {
      if (!initiative.sprint_refs) {
        initiative.sprint_refs = [];
      }
      if (!initiative.sprint_refs.includes(sprintId)) {
        initiative.sprint_refs.push(sprintId);
      }
    }
    console.log(`[StubRoadmap] link: sprint=${sprintId} initiative=${initiativeId}`);
  }
}

// ---------------------------------------------------------------------------
// StubWorkBoardAdapter
// ---------------------------------------------------------------------------

export class StubWorkBoardAdapter implements WorkBoardAdapter {
  private sprints: Map<string, Sprint> = new Map();
  private sprintCounter = 0;

  async createSprint(goal: string, roadmapRef?: string): Promise<Sprint> {
    this.sprintCounter += 1;
    const id = `sprint-${String(this.sprintCounter).padStart(2, '0')}`;

    const stages = STAGE_ORDER.map((name, idx) => ({
      name,
      owner: STAGE_OWNERS[name],
      status: (idx === 0 ? 'in_progress' : 'pending') as StageStatus,
    }));

    const sprint: Sprint = {
      id,
      goal,
      roadmap_ref: roadmapRef,
      stages,
      budget: {},
      created_at: new Date().toISOString(),
    };

    this.sprints.set(id, sprint);
    console.log(`[StubWorkBoard] createSprint: ${id} "${goal}"`);
    return sprint;
  }

  async listTasks(sprintId: string): Promise<Task[]> {
    const sprint = this.sprints.get(sprintId);
    if (!sprint) return [];
    return sprint.stages.map((stage) => ({
      id: `${sprintId}-${stage.name}`,
      sprint: sprintId,
      stage: stage.name,
      title: stage.name,
      status: stage.status,
      owner: stage.owner,
    }));
  }

  async moveTask(taskId: string, toStage: StageName): Promise<void> {
    const { sprintId, stageName } = parseTaskId(taskId);
    const sprint = this.sprints.get(sprintId);
    if (!sprint) return;
    const stage = sprint.stages.find((s) => s.name === stageName);
    if (stage) {
      stage.status = 'in_progress';
    }
    console.log(`[StubWorkBoard] moveTask: ${taskId} -> ${toStage}`);
  }

  async setStatus(taskId: string, status: StageStatus): Promise<void> {
    const { sprintId, stageName } = parseTaskId(taskId);
    const sprint = this.sprints.get(sprintId);
    if (!sprint) return;
    const stage = sprint.stages.find((s) => s.name === stageName);
    if (stage) {
      stage.status = status;
    }
    console.log(`[StubWorkBoard] setStatus: ${taskId} = ${status}`);
  }

  async comment(taskId: string, actor: string, text: string): Promise<void> {
    console.log(`[StubWorkBoard] comment: ${taskId} [${actor}] ${text}`);
  }
}

// ---------------------------------------------------------------------------
// StubConductorAdapter
// ---------------------------------------------------------------------------

export class StubConductorAdapter implements ConductorAdapter {
  async *drive(sprint: Sprint, ctx: ProjectContext): AsyncIterable<RunEvent> {
    const currentStage = sprint.stages.find(s => s.status === 'in_progress');
    const stageName = currentStage?.name ?? 'intake';

    console.log(`[StubConductor] drive: sprint=${sprint.id} stage=${stageName}`);

    if (ctx.stateOps) {
      // Sign-off gate stages: request a human sign-off
      if (stageName === 'adr' || stageName === 'ship') {
        await ctx.stateOps.requestSignoff(sprint.id, stageName as import('@skipper/core').StageName, `Stub ${stageName} sign-off required`);
      } else if (stageName === 'check') {
        await ctx.stateOps.recordCheckResult(sprint.id, 'check', 'stub-check', true, 'stub checks passed');
        await ctx.stateOps.recordArtifact(sprint.id, 'check', 'check-stub', 'stub checks passed');
      } else {
        // All other stages: record an artifact so the gate passes
        await ctx.stateOps.recordArtifact(sprint.id, stageName as import('@skipper/core').StageName, `${stageName}-stub`, `stub ${stageName} output`);
      }
    }

    yield {
      type: 'done',
      sprint: sprint.id,
      data: { message: 'stub conductor complete' },
    };
  }

  async ask(request: SignoffRequest): Promise<void> {
    console.log(
      `[StubConductor] ask: id=${request.id} sprint=${request.sprint} stage=${request.stage} reason="${request.reason}"`
    );
  }
}

// ---------------------------------------------------------------------------
// StubPersonaAdapter
// ---------------------------------------------------------------------------

export class StubPersonaAdapter implements PersonaAdapter {
  constructor(public readonly role: PersonaRole) {}

  async run(task: StageTask, _workspace: Workspace): Promise<StageResult> {
    console.log(
      `[StubPersona:${this.role}] run: sprint=${task.sprint.id} stage=${task.stage}`
    );
    return {
      success: true,
      artifactRef: 'stub-artifact',
      output: 'stub output',
    };
  }
}

// ---------------------------------------------------------------------------
// StubCheckAdapter
// ---------------------------------------------------------------------------

export class StubCheckAdapter implements CheckAdapter {
  constructor(public readonly name: string) {}

  async run(_workspace: Workspace): Promise<CheckResult> {
    console.log(`[StubCheck:${this.name}] run`);
    return {
      name: this.name,
      passed: true,
      output: 'stub check passed',
      ts: new Date().toISOString(),
    };
  }
}

// ---------------------------------------------------------------------------
// StubDeployAdapter
// ---------------------------------------------------------------------------

export class StubDeployAdapter implements DeployAdapter {
  async plan(workspace: Workspace): Promise<DeployPlan> {
    console.log(`[StubDeploy] plan: sprint=${workspace.sprint.id}`);
    return {
      sprint: workspace.sprint.id,
      strategy: 'rolling',
      canary: false,
    };
  }

  async execute(plan: DeployPlan): Promise<DeployResult> {
    console.log(`[StubDeploy] execute: sprint=${plan.sprint} strategy=${plan.strategy}`);
    return {
      success: true,
      output: `stub deploy complete (strategy=${plan.strategy})`,
      ts: new Date().toISOString(),
    };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createStubAdapters(): AdapterSet {
  const personaRoles: PersonaRole[] = [
    'architect',
    'coder',
    'reviewer',
    'qa',
    'security',
    'release',
    'sre',
  ];

  const personaMap = new Map<PersonaRole, PersonaAdapter>(
    personaRoles.map((role) => [role, new StubPersonaAdapter(role)])
  );

  return {
    roadmap: new StubRoadmapAdapter(),
    workboard: new StubWorkBoardAdapter(),
    conductor: new StubConductorAdapter(),
    persona: personaMap,
    checks: [new StubCheckAdapter('lint'), new StubCheckAdapter('test')],
    deploy: new StubDeployAdapter(),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseTaskId(taskId: string): { sprintId: string; stageName: StageName } {
  const lastHyphen = taskId.lastIndexOf('-');
  const sprintId = taskId.substring(0, lastHyphen);
  const stageName = taskId.substring(lastHyphen + 1) as StageName;
  return { sprintId, stageName };
}
