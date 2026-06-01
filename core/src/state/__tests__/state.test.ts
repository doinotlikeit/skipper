import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FileState } from '../index.js';
import { STAGE_ORDER, STAGE_OWNERS } from '../../types.js';
import type { Sprint, SkipperConfig } from '../../types.js';

let tmpDir: string;
let state: FileState;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skipper-state-test-'));
  state = new FileState(tmpDir);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ── Helper ────────────────────────────────────────────────────────────────────

function makeSprint(overrides: Partial<Sprint> = {}): Sprint {
  return {
    id: 'sprint-test-1',
    goal: 'Test goal',
    stages: STAGE_ORDER.map((name, i) => ({
      name,
      owner: STAGE_OWNERS[name],
      status: i === 0 ? ('in_progress' as const) : ('pending' as const),
    })),
    budget: {},
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// ── Directory layout ──────────────────────────────────────────────────────────

describe('init()', () => {
  it('creates the expected directory layout', async () => {
    await state.init();

    const skipperDir = state.skipperDir;

    // Directories
    const [skipperStat, sprintsStat, artifactsStat] = await Promise.all([
      fs.stat(skipperDir),
      fs.stat(path.join(skipperDir, 'sprints')),
      fs.stat(path.join(skipperDir, 'artifacts')),
    ]);
    expect(skipperStat.isDirectory()).toBe(true);
    expect(sprintsStat.isDirectory()).toBe(true);
    expect(artifactsStat.isDirectory()).toBe(true);

    // Files
    const [configStat, roadmapStat, logStat, runStat] = await Promise.all([
      fs.stat(path.join(skipperDir, 'config.yaml')),
      fs.stat(path.join(skipperDir, 'roadmap.md')),
      fs.stat(path.join(skipperDir, 'log.jsonl')),
      fs.stat(path.join(skipperDir, 'run.json')),
    ]);
    expect(configStat.isFile()).toBe(true);
    expect(roadmapStat.isFile()).toBe(true);
    expect(logStat.isFile()).toBe(true);
    expect(runStat.isFile()).toBe(true);
  });

  it('does not overwrite existing files on repeated init()', async () => {
    await state.init();
    // Write a custom config
    const custom: SkipperConfig = {
      adapters: {
        roadmap: 'custom',
        workboard: 'custom',
        conductor: 'custom',
        persona: 'custom',
        check: ['custom'],
        deploy: 'custom',
      },
    };
    await state.writeConfig(custom);

    // Re-init must not overwrite
    await state.init();

    const read = await state.readConfig();
    expect(read.adapters.roadmap).toBe('custom');
  });
});

// ── Config ────────────────────────────────────────────────────────────────────

describe('readConfig() / writeConfig()', () => {
  it('round-trips a config object', async () => {
    await state.init();
    const original = await state.readConfig();
    expect(original.adapters.roadmap).toBe('markdown');

    const updated: SkipperConfig = {
      ...original,
      adapters: { ...original.adapters, roadmap: 'linear' },
    };
    await state.writeConfig(updated);

    const read = await state.readConfig();
    expect(read.adapters.roadmap).toBe('linear');
    expect(read.adapters.workboard).toBe('markdown');
  });
});

// ── Sprint ────────────────────────────────────────────────────────────────────

describe('writeSprint() / readSprint()', () => {
  it('round-trips frontmatter and body', async () => {
    await state.init();
    const sprint = makeSprint({ budget: { max_tokens: 500 } });
    const body = '# Sprint Notes\n\nSome detail here.';

    await state.writeSprint(sprint, body);
    const read = await state.readSprint(sprint.id);

    expect(read.id).toBe(sprint.id);
    expect(read.goal).toBe('Test goal');
    expect(read.stages).toHaveLength(STAGE_ORDER.length);
    expect(read.stages[0].name).toBe('intake');
    expect(read.stages[0].status).toBe('in_progress');
    expect(read.budget.max_tokens).toBe(500);
  });

  it('listSprints() returns sprints sorted by filename', async () => {
    await state.init();
    // Write two sprints with IDs that sort differently
    await state.writeSprint(makeSprint({ id: 'b-sprint' }));
    await state.writeSprint(makeSprint({ id: 'a-sprint' }));

    const sprints = await state.listSprints();
    expect(sprints).toHaveLength(2);
    expect(sprints[0].id).toBe('a-sprint');
    expect(sprints[1].id).toBe('b-sprint');
  });
});

// ── Events ────────────────────────────────────────────────────────────────────

describe('appendEvent()', () => {
  it('is append-only — multiple calls produce multiple lines', async () => {
    await state.init();
    await state.appendEvent({
      actor: 'system',
      sprint: 'sp1',
      stage: 'intake',
      type: 'message',
      note: 'first',
    });
    await state.appendEvent({
      actor: 'system',
      sprint: 'sp1',
      stage: 'intake',
      type: 'message',
      note: 'second',
    });

    const events = await state.readEvents();
    expect(events).toHaveLength(2);
    expect(events[0].note).toBe('first');
    expect(events[1].note).toBe('second');
  });
});

describe('readEvents()', () => {
  it('returns all events without a filter', async () => {
    await state.init();
    await state.appendEvent({ actor: 'a', sprint: 'sp1', stage: 'intake', type: 'message' });
    await state.appendEvent({ actor: 'b', sprint: 'sp2', stage: 'adr', type: 'artifact' });

    const events = await state.readEvents();
    expect(events).toHaveLength(2);
  });

  it('filters by sprint', async () => {
    await state.init();
    await state.appendEvent({ actor: 'a', sprint: 'sp1', stage: 'intake', type: 'message' });
    await state.appendEvent({ actor: 'b', sprint: 'sp2', stage: 'adr', type: 'artifact' });

    const sp1Events = await state.readEvents({ sprint: 'sp1' });
    expect(sp1Events).toHaveLength(1);
    expect(sp1Events[0].sprint).toBe('sp1');
  });

  it('filters by stage', async () => {
    await state.init();
    await state.appendEvent({ actor: 'a', sprint: 'sp1', stage: 'intake', type: 'message' });
    await state.appendEvent({ actor: 'b', sprint: 'sp1', stage: 'adr', type: 'artifact' });

    const adrEvents = await state.readEvents({ stage: 'adr' });
    expect(adrEvents).toHaveLength(1);
    expect(adrEvents[0].stage).toBe('adr');
  });

  it('filters by type', async () => {
    await state.init();
    await state.appendEvent({ actor: 'a', sprint: 'sp1', stage: 'intake', type: 'message' });
    await state.appendEvent({ actor: 'b', sprint: 'sp1', stage: 'intake', type: 'artifact' });

    const artifacts = await state.readEvents({ type: 'artifact' });
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].type).toBe('artifact');
  });
});

// ── Sign-offs ─────────────────────────────────────────────────────────────────

describe('recordSignOff()', () => {
  it('throws when actor does not start with human:', async () => {
    await state.init();
    await expect(
      state.recordSignOff({ sprint: 'sp1', stage: 'adr', actor: 'bot:123' }),
    ).rejects.toThrow('Sign-offs require a human actor (human:<id>)');
  });

  it('throws for empty actor', async () => {
    await state.init();
    await expect(
      state.recordSignOff({ sprint: 'sp1', stage: 'adr', actor: '' }),
    ).rejects.toThrow('Sign-offs require a human actor (human:<id>)');
  });

  it('succeeds for a valid human actor', async () => {
    await state.init();
    const signOff = await state.recordSignOff({
      sprint: 'sp1',
      stage: 'adr',
      actor: 'human:alice',
      note: 'LGTM',
    });
    expect(signOff.id).toBeTruthy();
    expect(signOff.actor).toBe('human:alice');
    expect(signOff.sprint).toBe('sp1');
    expect(signOff.stage).toBe('adr');
    expect(signOff.note).toBe('LGTM');
    expect(signOff.ts).toBeTruthy();
  });

  it('appends a signoff event to the log', async () => {
    await state.init();
    await state.recordSignOff({ sprint: 'sp1', stage: 'adr', actor: 'human:bob' });

    const events = await state.readEvents({ type: 'signoff' });
    expect(events).toHaveLength(1);
    expect(events[0].actor).toBe('human:bob');
    expect(events[0].stage).toBe('adr');
  });
});

describe('getSignOff()', () => {
  it('returns null when no sign-off exists', async () => {
    await state.init();
    const result = await state.getSignOff('sp1', 'adr');
    expect(result).toBeNull();
  });

  it('returns null for wrong sprint', async () => {
    await state.init();
    await state.recordSignOff({ sprint: 'sp1', stage: 'adr', actor: 'human:alice' });
    const result = await state.getSignOff('sp-other', 'adr');
    expect(result).toBeNull();
  });

  it('returns the most recent sign-off record for sprint+stage', async () => {
    await state.init();
    await state.recordSignOff({ sprint: 'sp1', stage: 'adr', actor: 'human:user1' });
    // Second sign-off for same sprint+stage
    await state.recordSignOff({ sprint: 'sp1', stage: 'adr', actor: 'human:user2', note: 'revised' });

    const result = await state.getSignOff('sp1', 'adr');
    expect(result).not.toBeNull();
    expect(result?.actor).toBe('human:user2');
    expect(result?.note).toBe('revised');
  });
});

// ── Pending sign-off requests ─────────────────────────────────────────────────

describe('listPendingSignoffRequests()', () => {
  it('returns empty when no signoff_request events exist', async () => {
    await state.init();
    const pending = await state.listPendingSignoffRequests();
    expect(pending).toHaveLength(0);
  });

  it('returns a pending request that has not been signed off', async () => {
    await state.init();
    await state.appendEvent({
      actor: 'system',
      sprint: 'sp1',
      stage: 'adr',
      type: 'signoff_request',
      ref: 'req-001',
      note: 'budget exhausted',
    });

    const pending = await state.listPendingSignoffRequests();
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe('req-001');
    expect(pending[0].sprint).toBe('sp1');
    expect(pending[0].stage).toBe('adr');
    expect(pending[0].reason).toBe('budget exhausted');
  });

  it('does not return a request that has been signed off', async () => {
    await state.init();
    await state.appendEvent({
      actor: 'system',
      sprint: 'sp1',
      stage: 'adr',
      type: 'signoff_request',
      ref: 'req-001',
      note: 'budget exhausted',
    });
    // Sign it off
    await state.recordSignOff({ sprint: 'sp1', stage: 'adr', actor: 'human:alice' });

    const pending = await state.listPendingSignoffRequests();
    expect(pending).toHaveLength(0);
  });
});
