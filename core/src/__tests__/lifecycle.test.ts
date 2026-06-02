import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Core } from '../core.js';
import { FileState } from '../state/index.js';
import type { PersonaRole } from '../types.js';
import type {
  AdapterSet,
  ConductorAdapter,
  CheckAdapter,
  DeployAdapter,
  RoadmapAdapter,
  WorkBoardAdapter,
  PersonaAdapter,
} from '../adapters/interfaces.js';

const execFile = promisify(execFileCb);
const git = (cwd: string, args: string[]) => execFile('git', ['-C', cwd, ...args]);

let repo: string;

beforeEach(async () => {
  repo = await fs.mkdtemp(path.join(os.tmpdir(), 'skipper-lifecycle-'));
  await git(repo, ['init', '-q']);
  await git(repo, ['config', 'user.email', 'test@skipper.dev']);
  await git(repo, ['config', 'user.name', 'Skipper Test']);
  await git(repo, ['commit', '--allow-empty', '-m', 'root', '--no-verify']);
});

afterEach(async () => {
  await fs.rm(repo, { recursive: true, force: true });
});

// A conductor that simulates the crew: the coder writes a file into the sprint
// worktree; adr/ship request human sign-offs; other stages record an artifact.
function makeAdapters(): AdapterSet {
  const conductor: ConductorAdapter = {
    async *drive(sprint, ctx) {
      const stage = sprint.stages.find((s) => s.status === 'in_progress');
      if (!stage) return;
      if (stage.name === 'build') {
        const dir = ctx.worktreePath ?? ctx.repoPath;
        await fs.writeFile(path.join(dir, 'feature.txt'), 'hello from the coder\n');
        await ctx.stateOps?.recordArtifact(sprint.id, 'build', 'build-output', 'wrote feature.txt');
      } else if (stage.name === 'adr' || stage.name === 'ship') {
        await ctx.stateOps?.requestSignoff(sprint.id, stage.name, `approve ${stage.name}`);
      } else {
        await ctx.stateOps?.recordArtifact(sprint.id, stage.name, `${stage.name}-output`, 'done');
      }
      yield { type: 'done', sprint: sprint.id, stage: stage.name, data: 'ok' };
    },
    async ask() {},
  };

  // The check runs against whatever workspace Core hands it — proving the check
  // stage operates on the sprint worktree and sees the coder's committed file.
  const seesFile: CheckAdapter = {
    name: 'sees-file',
    async run(ws) {
      const dir = ws.worktreePath ?? ws.repoPath;
      const found = await fs
        .access(path.join(dir, 'feature.txt'))
        .then(() => true)
        .catch(() => false);
      return { name: 'sees-file', passed: found, output: found ? 'found' : 'missing', ts: new Date().toISOString() };
    },
  };

  const deploy: DeployAdapter = {
    async plan(ws) {
      return { sprint: ws.sprint.id, strategy: 'test', canary: false };
    },
    async execute() {
      return { success: true, output: 'deployed', ts: new Date().toISOString() };
    },
  };

  const roadmap = {} as RoadmapAdapter;
  const workboard = {} as WorkBoardAdapter;

  return {
    roadmap,
    workboard,
    conductor,
    persona: new Map<PersonaRole, PersonaAdapter>(),
    checks: [seesFile],
    deploy,
  };
}

/** Drive the sprint, auto-approving each sign-off, until it completes. */
async function runWithSignoffs(core: Core, sprintId: string): Promise<string[]> {
  const checkEvents: string[] = [];
  for (let guard = 0; guard < 30; guard++) {
    for await (const ev of core.runSprint(sprintId)) {
      if (ev.type === 'progress' && typeof ev.data === 'string' && ev.data.startsWith('check ')) {
        checkEvents.push(ev.data);
      }
    }
    const { sprint } = await core.getSprintStatus(sprintId);
    const done = sprint.stages.every((s) => s.status === 'done' || s.status === 'signed_off');
    if (done) break;

    const pending = await core.listPendingSignoffs();
    if (pending.length > 0) {
      await core.approveSignoff(pending[0].id, 'human:test');
      // The deploy/land step happens at the ship gate.
      if (pending[0].stage === 'ship') {
        await core.deploy(sprintId);
      }
    }
  }
  return checkEvents;
}

describe('build artifact lifecycle', () => {
  it("commits the coder's diff, checks the branch, and merges it into main", async () => {
    const state = new FileState(repo);
    await state.init();
    const core = new Core(state, makeAdapters());

    const sprint = await core.planSprint('Add feature.txt');
    const checks = await runWithSignoffs(core, sprint.id);

    // The check stage ran against the worktree and saw the committed file.
    expect(checks).toContain('check sees-file: pass');

    // The file is now on the repo's default branch (merged), not just the worktree.
    const onMain = await fs
      .access(path.join(repo, 'feature.txt'))
      .then(() => true)
      .catch(() => false);
    expect(onMain).toBe(true);

    // The merge commit is in the default branch history.
    const log = (await git(repo, ['log', '--oneline'])).stdout;
    expect(log).toMatch(/Land .*Add feature\.txt/);

    // The worktree was cleaned up and the sprint branch deleted after landing.
    const branches = (await git(repo, ['branch', '--list', `skipper/${sprint.id}`])).stdout.trim();
    expect(branches).toBe('');
    const wtExists = await fs
      .access(path.join(repo, '.skipper', 'worktrees', sprint.id))
      .then(() => true)
      .catch(() => false);
    expect(wtExists).toBe(false);
  });
});
