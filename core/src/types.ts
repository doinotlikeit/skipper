// All shared domain types for Skipper core

export type StageName =
  | 'intake'
  | 'adr'
  | 'plan'
  | 'build'
  | 'check'
  | 'ship'
  | 'watch'
  | 'retro';

export type StageStatus =
  | 'pending'
  | 'in_progress'
  | 'escalated'
  | 'signed_off'
  | 'done'
  | 'failed';

export type EventType =
  | 'handoff'
  | 'artifact'
  | 'message'
  | 'signoff_request'
  | 'signoff'
  | 'transition'
  | 'check';

export type PersonaRole =
  | 'architect'
  | 'coder'
  | 'reviewer'
  | 'qa'
  | 'security'
  | 'release'
  | 'sre';

export type AdapterSeam =
  | 'roadmap'
  | 'workboard'
  | 'conductor'
  | 'persona'
  | 'check'
  | 'deploy';

export interface Stage {
  name: StageName;
  owner: PersonaRole | string;
  status: StageStatus;
  task_ref?: string;
}

export interface SprintBudget {
  max_tokens?: number;
  max_cost_usd?: number;
  tokens_used?: number;
  cost_used_usd?: number;
}

export interface Sprint {
  id: string;
  goal: string;
  roadmap_ref?: string;
  stages: Stage[];
  budget: SprintBudget;
  created_at?: string;
}

export interface SkipperEvent {
  ts: string; // ISO 8601
  actor: string; // 'coder' | 'architect' | ... | 'human:<id>'
  sprint: string;
  stage: StageName;
  type: EventType;
  ref?: string;
  note?: string;
}

export interface SignOff {
  id: string;
  sprint: string;
  stage: StageName;
  actor: string; // must start with 'human:'
  ts: string;
  note?: string;
}

export interface Initiative {
  id: string;
  text: string;
  sprint_refs?: string[];
}

export interface Task {
  id: string;
  sprint: string;
  stage: StageName;
  title: string;
  status: StageStatus;
  owner?: string;
}

export interface CheckResult {
  name: string;
  passed: boolean;
  output: string;
  ts: string;
}

export interface DeployPlan {
  sprint: string;
  strategy: string;
  canary?: boolean;
}

export interface DeployResult {
  success: boolean;
  output: string;
  ts: string;
}

export type AgentBackend = 'claude-code' | 'api' | 'stub';

export interface SkipperConfig {
  adapters: {
    roadmap: string;
    workboard: string;
    conductor: string;
    persona: string;
    check: string[];
    deploy: string;
  };
  /**
   * Pins the agent backend the conductor/persona adapters run on. When unset,
   * it is resolved by detection: Claude Code CLI → ANTHROPIC_API_KEY → stub
   * (see spec/04 — Agent backend resolution).
   */
  backend?: AgentBackend;
  budgets?: {
    default?: SprintBudget;
  };
  models?: {
    architect?: string;
    coder?: string;
    reviewer?: string;
  };
}

// Minimal bridge so conductor/personas can record events without importing Core directly.
// Core passes this in; adapters call it instead of mutating state themselves.
export interface StateOps {
  recordArtifact(sprint: string, stage: StageName, ref: string, note?: string): Promise<void>;
  requestSignoff(sprint: string, stage: StageName, reason: string): Promise<string>;
  postMessage(sprint: string, stage: StageName, actor: string, note: string): Promise<void>;
  recordCheckResult(sprint: string, stage: StageName, name: string, passed: boolean, output?: string): Promise<void>;
}

export interface ProjectContext {
  repoPath: string;
  understanding?: string;
  stateOps?: StateOps;
  /**
   * The active sprint's isolated worktree, when one exists (build/check/ship).
   * Personas should run here so changes land on the sprint branch, not main.
   */
  worktreePath?: string;
}

export interface Workspace {
  repoPath: string;
  worktreePath?: string;
  sprint: Sprint;
  stage: StageName;
}

export interface StageTask {
  sprint: Sprint;
  stage: StageName;
  context: ProjectContext;
}

export interface StageResult {
  success: boolean;
  artifactRef?: string;
  output: string;
  checksPassed?: boolean;
}

export interface RunEvent {
  type: 'progress' | 'artifact' | 'message' | 'error' | 'done';
  sprint: string;
  stage?: StageName;
  data: unknown;
}

export interface SignoffRequest {
  id: string;
  sprint: string;
  stage: StageName;
  reason: string;
  ts: string;
}

export interface Question {
  id: string;
  sprint: string;
  stage?: StageName;
  text: string;
  ts: string;
}

export interface AgentResult {
  role: PersonaRole;
  task: string;
  output: string;
  success: boolean;
}

export interface AdapterInfo {
  seam: AdapterSeam;
  impl: string;
  available: string[];
}

export interface RunOptions {
  stage?: StageName;
  watch?: boolean;
}

export interface EventFilter {
  sprint?: string;
  stage?: StageName;
  type?: EventType;
  since?: string;
}

// Sprint stage order — the canonical sequence
export const STAGE_ORDER: StageName[] = [
  'intake',
  'adr',
  'plan',
  'build',
  'check',
  'ship',
  'watch',
  'retro',
];

// Default stage owners
export const STAGE_OWNERS: Record<StageName, PersonaRole> = {
  intake:  'architect',
  adr:     'architect',
  plan:    'architect',
  build:   'coder',
  check:   'reviewer',
  ship:    'release',
  watch:   'sre',
  retro:   'architect',
};

// Stages that require a human sign-off to leave
export const SIGNOFF_GATES: StageName[] = ['adr', 'ship'];
