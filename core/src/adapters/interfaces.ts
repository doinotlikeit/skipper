import type {
  Sprint,
  StageName,
  StageStatus,
  PersonaRole,
  Workspace,
  StageTask,
  StageResult,
  RunEvent,
  SignoffRequest,
  Question,
  Initiative,
  Task,
  CheckResult,
  DeployPlan,
  DeployResult,
  ProjectContext,
} from '../types.js';

export interface RoadmapAdapter {
  listInitiatives(): Promise<Initiative[]>;
  addInitiative(text: string): Promise<Initiative>;
  link(sprintId: string, initiativeId: string): Promise<void>;
}

export interface WorkBoardAdapter {
  createSprint(goal: string, roadmapRef?: string): Promise<Sprint>;
  listTasks(sprintId: string): Promise<Task[]>;
  moveTask(taskId: string, toStage: StageName): Promise<void>;
  setStatus(taskId: string, status: StageStatus): Promise<void>;
  comment(taskId: string, actor: string, text: string): Promise<void>;
}

export interface ConductorAdapter {
  drive(sprint: Sprint, ctx: ProjectContext): AsyncIterable<RunEvent>;
  ask(request: SignoffRequest | Question): Promise<void>;
}

export interface PersonaAdapter {
  role: PersonaRole;
  run(task: StageTask, workspace: Workspace): Promise<StageResult>;
}

export interface CheckAdapter {
  name: string;
  run(workspace: Workspace): Promise<CheckResult>;
}

export interface DeployAdapter {
  plan(workspace: Workspace): Promise<DeployPlan>;
  execute(plan: DeployPlan): Promise<DeployResult>;
}

export interface AdapterSet {
  roadmap: RoadmapAdapter;
  workboard: WorkBoardAdapter;
  conductor: ConductorAdapter;
  persona: Map<PersonaRole, PersonaAdapter>;
  checks: CheckAdapter[];
  deploy: DeployAdapter;
}
