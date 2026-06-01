import * as fs from 'node:fs';
import * as path from 'node:path';
import matter from 'gray-matter';
import type { Sprint, Task, StageName, StageStatus } from '@skipper/core';
import type { WorkBoardAdapter } from '@skipper/core';
import { STAGE_ORDER, STAGE_OWNERS } from '@skipper/core';

// ---------------------------------------------------------------------------
// Sprint file format (.skipper/sprints/sprint-NN.md):
//
// ---
// id: sprint-01
// goal: "..."
// roadmap_ref: "..."
// stages:
//   - name: intake
//     owner: architect
//     status: in_progress
//   - name: adr
//     owner: architect
//     status: pending
// budget: {}
// created_at: "2024-01-01T00:00:00.000Z"
// ---
// # Sprint 01 — <goal>
// ---------------------------------------------------------------------------

interface SprintFrontmatter {
  id: string;
  goal: string;
  roadmap_ref?: string;
  stages: Array<{ name: string; owner: string; status: string; task_ref?: string }>;
  budget: Record<string, unknown>;
  created_at?: string;
}

export class MarkdownWorkBoardAdapter implements WorkBoardAdapter {
  private readonly sprintsDir: string;

  constructor(private readonly skipperDir: string) {
    this.sprintsDir = path.join(skipperDir, 'sprints');
  }

  async createSprint(goal: string, roadmapRef?: string): Promise<Sprint> {
    this.ensureSprintsDir();

    const existing = this.listSprintFiles();
    const nextN = existing.length + 1;
    const id = `sprint-${String(nextN).padStart(2, '0')}`;

    const stages = STAGE_ORDER.map((name, idx) => ({
      name,
      owner: STAGE_OWNERS[name] as string,
      status: (idx === 0 ? 'in_progress' : 'pending') as StageStatus,
    }));

    const createdAt = new Date().toISOString();

    const frontmatter: SprintFrontmatter = {
      id,
      goal,
      roadmap_ref: roadmapRef,
      stages,
      budget: {},
      created_at: createdAt,
    };

    const body = `# Sprint ${String(nextN).padStart(2, '0')} — ${goal}\n`;
    const fileContent = matter.stringify(body, frontmatter);
    const filePath = path.join(this.sprintsDir, `${id}.md`);
    fs.writeFileSync(filePath, fileContent, 'utf8');

    const sprint: Sprint = {
      id,
      goal,
      roadmap_ref: roadmapRef,
      stages,
      budget: {},
      created_at: createdAt,
    };

    return sprint;
  }

  async listTasks(sprintId: string): Promise<Task[]> {
    const sprint = this.readSprint(sprintId);
    if (!sprint) return [];

    return sprint.stages.map((stage) => ({
      id: `${sprintId}-${stage.name}`,
      sprint: sprintId,
      stage: stage.name as StageName,
      title: stage.name,
      status: stage.status as StageStatus,
      owner: stage.owner,
    }));
  }

  async moveTask(taskId: string, _toStage: StageName): Promise<void> {
    const { sprintId, stageName } = parseTaskId(taskId);
    await this.updateStageStatus(sprintId, stageName, 'in_progress');
  }

  async setStatus(taskId: string, status: StageStatus): Promise<void> {
    const { sprintId, stageName } = parseTaskId(taskId);
    await this.updateStageStatus(sprintId, stageName, status);
  }

  async comment(taskId: string, actor: string, text: string): Promise<void> {
    const { sprintId } = parseTaskId(taskId);
    const filePath = this.sprintFilePath(sprintId);
    if (!fs.existsSync(filePath)) return;

    const commentLine = `<!-- comment: [${actor}] ${text} -->\n`;
    fs.appendFileSync(filePath, commentLine, 'utf8');
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private ensureSprintsDir(): void {
    fs.mkdirSync(this.sprintsDir, { recursive: true });
  }

  private listSprintFiles(): string[] {
    if (!fs.existsSync(this.sprintsDir)) return [];
    return fs
      .readdirSync(this.sprintsDir)
      .filter((f) => f.endsWith('.md') && f.startsWith('sprint-'));
  }

  private sprintFilePath(sprintId: string): string {
    return path.join(this.sprintsDir, `${sprintId}.md`);
  }

  private readSprint(sprintId: string): SprintFrontmatter | null {
    const filePath = this.sprintFilePath(sprintId);
    if (!fs.existsSync(filePath)) return null;

    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = matter(raw);
    return parsed.data as SprintFrontmatter;
  }

  private async updateStageStatus(
    sprintId: string,
    stageName: string,
    status: StageStatus
  ): Promise<void> {
    const filePath = this.sprintFilePath(sprintId);
    if (!fs.existsSync(filePath)) return;

    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = matter(raw);
    const data = parsed.data as SprintFrontmatter;

    const stage = data.stages.find((s) => s.name === stageName);
    if (stage) {
      stage.status = status;
    }

    const updated = matter.stringify(parsed.content, data);
    fs.writeFileSync(filePath, updated, 'utf8');
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseTaskId(taskId: string): { sprintId: string; stageName: string } {
  const lastHyphen = taskId.lastIndexOf('-');
  const sprintId = taskId.substring(0, lastHyphen);
  const stageName = taskId.substring(lastHyphen + 1);
  return { sprintId, stageName };
}
