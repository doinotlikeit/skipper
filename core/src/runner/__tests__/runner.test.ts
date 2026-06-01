import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FileState } from '../../state/index.js';
import { SprintRunner } from '../index.js';
import type { AdapterSet } from '../../adapters/interfaces.js';
import type {
  Sprint,
  ProjectContext,
  Workspace,
  StageTask,
  StageResult,
  RunEvent,
  Task,
  StageStatus,
  SignoffRequest,
  Question,
  Initiative,
  DeployPlan,
  DeployResult,
  PersonaRole,
  StageName,
} from '../../types.js';

// ── Stub adapters ─────────────────────────────────────────────────────────────

function makeStubAdapters(): AdapterSet {
  return {
    roadmap: {
      listInitiatives: async (): Promise<Initiative[]> => [],
      addInitiative: async (text: string): Promise<Initiative> => ({
        id: 'init-stub',
        text,
      }),
      link: async (): Promise<void> => {},
    },
    workboard: {
      createSprint: async (goal: string): Promise<Sprint> => ({
        id: 'stub-sprint',
        goal,
        stages: [],
        budget: {},
      }),
      listTasks: async (): Promise<Task[]> => [],
      moveTask: async (): Promise<void> => {},
      setStatus: async (): Promise<void> => {},
      comment: async (): Promise<void> => {},
    },
    conductor: {
      drive: (
        _sprint: Sprint,
        _ctx: ProjectContext,
      ): AsyncIterable<RunEvent> => {
        return {
          [Symbol.asyncIterator]() {
            return {
              async next(): Promise<IteratorResult<RunEvent>> {
                return { value: undefined as unknown as RunEvent, done: true };
              },
            };
          },
        };
      },
      ask: async (_req: SignoffRequest | Question): Promise<void> => {},
    },
    persona: new Map<PersonaRole, { role: PersonaRole; run: (t: StageTask, w: Workspace) => Promise<StageResult> }>(),
    checks: [],
    deploy: {
      plan: async (workspace: Workspace): Promise<DeployPlan> => ({
        sprint: workspace.sprint.id,
        strategy: 'direct',
      }),
      execute: async (_plan: DeployPlan): Promise<DeployResult> => ({
        success: true,
        output: 'deployed',
        ts: new Date().toISOString(),
      }),
    },
  };
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

let tmpDir: string;
let state: FileState;
let runner: SprintRunner;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skipper-runner-test-'));
  state = new FileState(tmpDir);
  await state.init();
  runner = new SprintRunner(state, makeStubAdapters());
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ── createSprint() ────────────────────────────────────────────────────────────

describe('createSprint()', () => {
  it('writes a sprint file and appends a sprint.created message event', async () => {
    const sprint = await runner.createSprint('Build the feature');

    // Sprint file persisted
    const stored = await state.readSprint(sprint.id);
    expect(stored.goal).toBe('Build the feature');
    expect(stored.stages[0].name).toBe('intake');
    expect(stored.stages[0].status).toBe('in_progress');

    // Event appended
    const events = await state.readEvents({ sprint: sprint.id });
    const created = events.find(
      e => e.type === 'message' && e.note?.includes('sprint.created'),
    );
    expect(created).toBeDefined();
  });

  it('includes roadmapRef in the sprint when supplied', async () => {
    const sprint = await runner.createSprint('Goal', 'roadmap-item-1');
    const stored = await state.readSprint(sprint.id);
    expect(stored.roadmap_ref).toBe('roadmap-item-1');
  });
});

// ── getCurrentStage() / getNextStage() ────────────────────────────────────────

describe('getCurrentStage() / getNextStage()', () => {
  it('returns the in_progress stage', async () => {
    const sprint = await runner.createSprint('test');
    const current = runner.getCurrentStage(sprint);
    expect(current?.name).toBe('intake');
  });

  it('returns null next stage at the last stage', async () => {
    const sprint = await runner.createSprint('test');
    const lastStageSprint: Sprint = {
      ...sprint,
      stages: sprint.stages.map((s, i, arr) => ({
        ...s,
        status: i === arr.length - 1 ? ('in_progress' as StageStatus) : ('done' as StageStatus),
      })),
    };
    const next = runner.getNextStage(lastStageSprint);
    expect(next).toBeNull();
  });
});

// ── advance() — gate failures ─────────────────────────────────────────────────

describe('advance() gate conditions', () => {
  it('refuses transition when intake gate not met (no artifact)', async () => {
    const sprint = await runner.createSprint('no-artifact goal');
    const result = await runner.advance(sprint.id);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/intake gate/i);
    }
  });

  it('refuses adr→plan when sign-off gate not met', async () => {
    const sprint = await runner.createSprint('sign-off test');

    // Satisfy intake gate
    await state.appendEvent({
      actor: 'system',
      sprint: sprint.id,
      stage: 'intake',
      type: 'artifact',
      ref: 'intake-artifact',
    });

    // Advance intake→adr (should succeed)
    const advanceToAdr = await runner.advance(sprint.id);
    expect(advanceToAdr.ok).toBe(true);

    // Now try to advance adr→plan without a sign-off
    const result = await runner.advance(sprint.id);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/adr gate/i);
    }
  });
});

// ── advance() — successful transitions ───────────────────────────────────────

describe('advance() successful transitions', () => {
  it('succeeds for intake→adr when an artifact event exists', async () => {
    const sprint = await runner.createSprint('artifact goal');

    await state.appendEvent({
      actor: 'system',
      sprint: sprint.id,
      stage: 'intake',
      type: 'artifact',
      ref: 'artifact-001',
    });

    const result = await runner.advance(sprint.id);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.from).toBe('intake');
      expect(result.to).toBe('adr');
      expect(result.sprint.stages.find(s => s.name === 'intake')?.status).toBe('done');
      expect(result.sprint.stages.find(s => s.name === 'adr')?.status).toBe('in_progress');
    }
  });

  it('appends a transition event on success', async () => {
    const sprint = await runner.createSprint('transition event test');
    await state.appendEvent({
      actor: 'system',
      sprint: sprint.id,
      stage: 'intake',
      type: 'artifact',
    });

    await runner.advance(sprint.id);

    const events = await state.readEvents({ sprint: sprint.id, type: 'transition' });
    expect(events).toHaveLength(1);
    expect(events[0].note).toContain('intake');
    expect(events[0].note).toContain('adr');
  });

  it('succeeds for adr→plan when a valid human sign-off is recorded', async () => {
    const sprint = await runner.createSprint('signoff goal');

    // Satisfy intake gate and advance
    await state.appendEvent({
      actor: 'system',
      sprint: sprint.id,
      stage: 'intake',
      type: 'artifact',
    });
    const r1 = await runner.advance(sprint.id);
    expect(r1.ok).toBe(true); // intake → adr

    // Provide human sign-off for adr
    await state.recordSignOff({
      sprint: sprint.id,
      stage: 'adr',
      actor: 'human:reviewer',
      note: 'Approved',
    });

    const r2 = await runner.advance(sprint.id);
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      expect(r2.from).toBe('adr');
      expect(r2.to).toBe('plan');
    }
  });
});

// ── advance() — illegal transition ───────────────────────────────────────────

describe('advance() illegal transition', () => {
  it('refuses an illegal transition (intake→build)', async () => {
    const sprint = await runner.createSprint('illegal');
    const result = await runner.advance(sprint.id, 'build');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/illegal transition/i);
    }
  });

  it('refuses advancing a stage to itself', async () => {
    const sprint = await runner.createSprint('same stage');
    const result = await runner.advance(sprint.id, 'intake');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/illegal transition/i);
    }
  });
});

// ── advance() — budget exhaustion ────────────────────────────────────────────

describe('advance() budget exhaustion', () => {
  it('escalates and appends signoff_request when token budget exhausted', async () => {
    const sprint = await runner.createSprint('budget-test');

    // Overwrite with exhausted token budget
    const exhausted: Sprint = {
      ...sprint,
      budget: { max_tokens: 100, tokens_used: 100 },
    };
    await state.writeSprint(exhausted);

    // Satisfy intake gate
    await state.appendEvent({
      actor: 'system',
      sprint: sprint.id,
      stage: 'intake',
      type: 'artifact',
    });

    const result = await runner.advance(sprint.id);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.escalated).toBe(true);
      expect(result.reason).toMatch(/token budget/i);
    }

    // Stage should be escalated
    const stored = await state.readSprint(sprint.id);
    expect(stored.stages.find(s => s.name === 'intake')?.status).toBe('escalated');

    // signoff_request event should have been appended
    const events = await state.readEvents({
      sprint: sprint.id,
      type: 'signoff_request',
    });
    expect(events).toHaveLength(1);
  });

  it('escalates when cost budget exhausted', async () => {
    const sprint = await runner.createSprint('cost-budget-test');
    const exhausted: Sprint = {
      ...sprint,
      budget: { max_cost_usd: 1.0, cost_used_usd: 1.5 },
    };
    await state.writeSprint(exhausted);

    await state.appendEvent({
      actor: 'system',
      sprint: sprint.id,
      stage: 'intake',
      type: 'artifact',
    });

    const result = await runner.advance(sprint.id);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.escalated).toBe(true);
      expect(result.reason).toMatch(/cost budget/i);
    }
  });

  it('does not escalate when budget limits are unset', async () => {
    const sprint = await runner.createSprint('no-budget-limits');
    await state.appendEvent({
      actor: 'system',
      sprint: sprint.id,
      stage: 'intake',
      type: 'artifact',
    });

    const result = await runner.advance(sprint.id);
    // Should succeed (gate passes, no budget limits set)
    expect(result.ok).toBe(true);
  });
});

// ── advance() — sprint with no active stage ───────────────────────────────────

describe('advance() edge cases', () => {
  it('refuses when no active stage found', async () => {
    const sprint = await runner.createSprint('all-done');
    // Mark all stages done
    const allDone: Sprint = {
      ...sprint,
      stages: sprint.stages.map(s => ({ ...s, status: 'done' as StageStatus })),
    };
    await state.writeSprint(allDone);

    const result = await runner.advance(sprint.id);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/no active/i);
    }
  });
});
