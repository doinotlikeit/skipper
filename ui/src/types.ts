// Shared domain types — defined inline in the UI package.
// Do NOT import these from core or any other package.

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

export interface Stage {
  name: StageName;
  owner: string;
  status: StageStatus;
  task_ref?: string;
}

export interface Sprint {
  id: string;
  goal: string;
  roadmap_ref?: string;
  stages: Stage[];
  budget: Record<string, unknown>;
  created_at?: string;
}

export interface Task {
  id: string;
  sprint: string;
  stage: StageName;
  title: string;
  status: StageStatus;
  owner?: string;
}

export interface SkipperEvent {
  ts: string;
  actor: string;
  sprint: string;
  stage: StageName;
  type: EventType;
  ref?: string;
  note?: string;
}

export interface SignoffRequest {
  id: string;
  sprint: string;
  stage: StageName;
  reason: string;
  ts: string;
}

export interface Initiative {
  id: string;
  text: string;
  sprint_refs?: string[];
}
