import path from 'path';
import { promises as fs } from 'fs';
import yaml from 'js-yaml';
import matter from 'gray-matter';
import { v4 as uuidv4 } from 'uuid';
import type {
  Sprint,
  SkipperEvent,
  SignOff,
  SignoffRequest,
  SkipperConfig,
  StageName,
  EventFilter,
} from '../types.js';

const DEFAULT_CONFIG: SkipperConfig = {
  adapters: {
    roadmap: 'markdown',
    workboard: 'markdown',
    conductor: 'stub',
    persona: 'stub',
    check: ['stub'],
    deploy: 'stub',
  },
};

export class FileState {
  constructor(readonly repoPath: string) {}

  get skipperDir(): string {
    return path.join(this.repoPath, '.skipper');
  }

  private get configPath(): string {
    return path.join(this.skipperDir, 'config.yaml');
  }

  private get roadmapPath(): string {
    return path.join(this.skipperDir, 'roadmap.md');
  }

  private get sprintsDir(): string {
    return path.join(this.skipperDir, 'sprints');
  }

  private get logPath(): string {
    return path.join(this.skipperDir, 'log.jsonl');
  }

  private get artifactsDir(): string {
    return path.join(this.skipperDir, 'artifacts');
  }

  private get runJsonPath(): string {
    return path.join(this.skipperDir, 'run.json');
  }

  private get signoffsPath(): string {
    return path.join(this.artifactsDir, 'signoffs.jsonl');
  }

  private get understandingPath(): string {
    return path.join(this.skipperDir, 'understanding.md');
  }

  async init(): Promise<void> {
    await fs.mkdir(this.skipperDir, { recursive: true });
    await fs.mkdir(this.sprintsDir, { recursive: true });
    await fs.mkdir(this.artifactsDir, { recursive: true });

    // config.yaml — write only if absent
    try {
      await fs.access(this.configPath);
    } catch {
      await fs.writeFile(this.configPath, yaml.dump(DEFAULT_CONFIG), 'utf-8');
    }

    // roadmap.md — write only if absent
    try {
      await fs.access(this.roadmapPath);
    } catch {
      await fs.writeFile(this.roadmapPath, '# Roadmap\n', 'utf-8');
    }

    // log.jsonl — write only if absent
    try {
      await fs.access(this.logPath);
    } catch {
      await fs.writeFile(this.logPath, '', 'utf-8');
    }

    // run.json — write only if absent
    try {
      await fs.access(this.runJsonPath);
    } catch {
      await fs.writeFile(this.runJsonPath, '{}', 'utf-8');
    }
  }

  async readConfig(): Promise<SkipperConfig> {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      const parsed = yaml.load(content) as SkipperConfig;
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('config.yaml is not a valid object');
      }
      return parsed;
    } catch (err) {
      throw new Error(`Failed to read config: ${(err as Error).message}`);
    }
  }

  async writeConfig(config: SkipperConfig): Promise<void> {
    try {
      await fs.writeFile(this.configPath, yaml.dump(config), 'utf-8');
    } catch (err) {
      throw new Error(`Failed to write config: ${(err as Error).message}`);
    }
  }

  async readRoadmap(): Promise<string> {
    try {
      return await fs.readFile(this.roadmapPath, 'utf-8');
    } catch (err) {
      throw new Error(`Failed to read roadmap: ${(err as Error).message}`);
    }
  }

  async writeRoadmap(content: string): Promise<void> {
    try {
      await fs.writeFile(this.roadmapPath, content, 'utf-8');
    } catch (err) {
      throw new Error(`Failed to write roadmap: ${(err as Error).message}`);
    }
  }

  async readSprint(id: string): Promise<Sprint> {
    const filePath = path.join(this.sprintsDir, `${id}.md`);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const { data } = matter(content);
      if (!data['id'] || !data['goal']) {
        throw new Error(`Sprint file missing required fields (id, goal): ${filePath}`);
      }
      return data as Sprint;
    } catch (err) {
      throw new Error(`Failed to read sprint ${id}: ${(err as Error).message}`);
    }
  }

  async writeSprint(sprint: Sprint, body?: string): Promise<void> {
    const filePath = path.join(this.sprintsDir, `${sprint.id}.md`);
    try {
      const frontmatter: Record<string, unknown> = {
        id: sprint.id,
        goal: sprint.goal,
        stages: sprint.stages,
        budget: sprint.budget,
      };
      if (sprint.roadmap_ref !== undefined) frontmatter['roadmap_ref'] = sprint.roadmap_ref;
      if (sprint.created_at !== undefined) frontmatter['created_at'] = sprint.created_at;

      const content = matter.stringify(body ?? '', frontmatter);
      await fs.writeFile(filePath, content, 'utf-8');
    } catch (err) {
      throw new Error(`Failed to write sprint ${sprint.id}: ${(err as Error).message}`);
    }
  }

  async listSprints(): Promise<Sprint[]> {
    try {
      let files: string[];
      try {
        files = await fs.readdir(this.sprintsDir);
      } catch {
        return [];
      }
      const mdFiles = files.filter(f => f.endsWith('.md')).sort();
      const sprints: Sprint[] = [];
      for (const file of mdFiles) {
        const id = path.basename(file, '.md');
        sprints.push(await this.readSprint(id));
      }
      return sprints;
    } catch (err) {
      throw new Error(`Failed to list sprints: ${(err as Error).message}`);
    }
  }

  async appendEvent(event: Omit<SkipperEvent, 'ts'>): Promise<void> {
    const fullEvent: SkipperEvent = {
      ...event,
      ts: new Date().toISOString(),
    };
    const line = JSON.stringify(fullEvent) + '\n';
    try {
      await fs.appendFile(this.logPath, line, { encoding: 'utf-8', flag: 'a' });
    } catch (err) {
      throw new Error(`Failed to append event to log: ${(err as Error).message}`);
    }
  }

  async readEvents(filter?: EventFilter): Promise<SkipperEvent[]> {
    try {
      let content: string;
      try {
        content = await fs.readFile(this.logPath, 'utf-8');
      } catch {
        return [];
      }

      const lines = content.split('\n').filter(l => l.trim() !== '');
      const events: SkipperEvent[] = lines.map(line => {
        try {
          return JSON.parse(line) as SkipperEvent;
        } catch {
          throw new Error(`Malformed event line in log.jsonl: ${line}`);
        }
      });

      if (!filter) return events;

      return events.filter(ev => {
        if (filter.sprint !== undefined && ev.sprint !== filter.sprint) return false;
        if (filter.stage !== undefined && ev.stage !== filter.stage) return false;
        if (filter.type !== undefined && ev.type !== filter.type) return false;
        if (filter.since !== undefined && ev.ts < filter.since) return false;
        return true;
      });
    } catch (err) {
      throw new Error(`Failed to read events: ${(err as Error).message}`);
    }
  }

  async recordSignOff(
    signOff: Omit<SignOff, 'id' | 'ts'> & { actor: string },
  ): Promise<SignOff> {
    if (!signOff.actor.startsWith('human:')) {
      throw new Error('Sign-offs require a human actor (human:<id>)');
    }

    const full: SignOff = {
      ...signOff,
      id: uuidv4(),
      ts: new Date().toISOString(),
    };

    // Append signoff event to the audit log
    await this.appendEvent({
      actor: full.actor,
      sprint: full.sprint,
      stage: full.stage,
      type: 'signoff',
      ref: full.id,
      note: full.note,
    });

    // Persist to artifacts/signoffs.jsonl
    const line = JSON.stringify(full) + '\n';
    try {
      await fs.appendFile(this.signoffsPath, line, { encoding: 'utf-8', flag: 'a' });
    } catch (err) {
      throw new Error(`Failed to persist sign-off record: ${(err as Error).message}`);
    }

    return full;
  }

  async getSignOff(sprintId: string, stage: StageName): Promise<SignOff | null> {
    try {
      let content: string;
      try {
        content = await fs.readFile(this.signoffsPath, 'utf-8');
      } catch {
        return null;
      }

      const lines = content.split('\n').filter(l => l.trim() !== '');
      const signoffs: SignOff[] = lines.map(l => JSON.parse(l) as SignOff);

      const matching = signoffs.filter(
        s => s.sprint === sprintId && s.stage === stage,
      );
      return matching.length > 0 ? matching[matching.length - 1] : null;
    } catch (err) {
      throw new Error(`Failed to get sign-off: ${(err as Error).message}`);
    }
  }

  async listPendingSignoffRequests(): Promise<SignoffRequest[]> {
    try {
      const events = await this.readEvents();
      const requests = events.filter(e => e.type === 'signoff_request');
      const signoffs = events.filter(e => e.type === 'signoff');

      // Build a map of sprint:stage -> most recent signoff timestamp
      const signoffTimestamps = new Map<string, string>();
      for (const s of signoffs) {
        const key = `${s.sprint}:${s.stage}`;
        const existing = signoffTimestamps.get(key);
        if (!existing || s.ts > existing) {
          signoffTimestamps.set(key, s.ts);
        }
      }

      return requests
        .filter(r => {
          const signoffTs = signoffTimestamps.get(`${r.sprint}:${r.stage}`);
          // Pending if no signoff, or the most recent signoff predates this request
          return !signoffTs || signoffTs < r.ts;
        })
        .map(r => ({
          id: r.ref ?? '',
          sprint: r.sprint,
          stage: r.stage,
          reason: r.note ?? '',
          ts: r.ts,
        }));
    } catch (err) {
      throw new Error(
        `Failed to list pending sign-off requests: ${(err as Error).message}`,
      );
    }
  }

  async readRunState(): Promise<Record<string, unknown>> {
    try {
      const content = await fs.readFile(this.runJsonPath, 'utf-8');
      return JSON.parse(content) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  async writeRunState(state: Record<string, unknown>): Promise<void> {
    try {
      await fs.writeFile(this.runJsonPath, JSON.stringify(state, null, 2), 'utf-8');
    } catch (err) {
      throw new Error(`Failed to write run state: ${(err as Error).message}`);
    }
  }

  async readUnderstanding(): Promise<string> {
    try {
      return await fs.readFile(this.understandingPath, 'utf-8');
    } catch {
      return '';
    }
  }

  async writeUnderstanding(content: string): Promise<void> {
    try {
      await fs.writeFile(this.understandingPath, content, 'utf-8');
    } catch (err) {
      throw new Error(`Failed to write understanding: ${(err as Error).message}`);
    }
  }
}
