import { Router } from 'express';
import type { Request, Response } from 'express';
import type { Core } from '../core.js';
import type { EventFilter, StageName, AdapterSeam, PersonaRole } from '../types.js';

export function createRouter(core: Core): Router {
  const router = Router();

  // ── Health ────────────────────────────────────────────────────────────────

  router.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', version: '0.1.0' });
  });

  // ── Project ───────────────────────────────────────────────────────────────

  router.get('/api/project/status', async (_req: Request, res: Response) => {
    try {
      const status = await core.getProjectStatus();
      res.json(status);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post('/api/project/init', async (req: Request, res: Response) => {
    const { repoPath } = req.body as { repoPath?: string };
    if (!repoPath) {
      res.status(400).json({ error: 'repoPath is required' });
      return;
    }
    try {
      await core.initProject(repoPath);
      res.status(201).json({ ok: true, repoPath });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post('/api/project/attach', async (req: Request, res: Response) => {
    const { repoPath } = req.body as { repoPath?: string };
    if (!repoPath) {
      res.status(400).json({ error: 'repoPath is required' });
      return;
    }
    try {
      await core.attachProject(repoPath);
      res.json({ ok: true, repoPath });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ── Roadmap ───────────────────────────────────────────────────────────────

  router.get('/api/roadmap', async (_req: Request, res: Response) => {
    try {
      const initiatives = await core.getRoadmap();
      res.json(initiatives);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post('/api/roadmap/initiatives', async (req: Request, res: Response) => {
    const { text } = req.body as { text?: string };
    if (!text) {
      res.status(400).json({ error: 'text is required' });
      return;
    }
    try {
      const initiative = await core.addInitiative(text);
      res.status(201).json(initiative);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ── Sprints ───────────────────────────────────────────────────────────────

  router.get('/api/sprints', async (_req: Request, res: Response) => {
    try {
      const sprints = await core.listSprints();
      res.json(sprints);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post('/api/sprints', async (req: Request, res: Response) => {
    const { goal, roadmapRef } = req.body as { goal?: string; roadmapRef?: string };
    if (!goal) {
      res.status(400).json({ error: 'goal is required' });
      return;
    }
    try {
      const sprint = await core.planSprint(goal, roadmapRef);
      res.status(201).json(sprint);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.get('/api/sprints/:id', async (req: Request, res: Response) => {
    try {
      const sprint = await core.getSprint(req.params['id']!);
      res.json(sprint);
    } catch (err) {
      const msg = (err as Error).message;
      const status = msg.includes('not found') || msg.includes('ENOENT') ? 404 : 500;
      res.status(status).json({ error: msg });
    }
  });

  router.get('/api/sprints/:id/status', async (req: Request, res: Response) => {
    try {
      const result = await core.getSprintStatus(req.params['id']!);
      res.json(result);
    } catch (err) {
      const msg = (err as Error).message;
      const status = msg.includes('not found') || msg.includes('ENOENT') ? 404 : 500;
      res.status(status).json({ error: msg });
    }
  });

  // ── Tasks ─────────────────────────────────────────────────────────────────

  router.get('/api/tasks', async (req: Request, res: Response) => {
    const sprintId = req.query['sprint'] as string | undefined;
    try {
      const tasks = await core.listTasks(sprintId);
      res.json(tasks);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.get('/api/tasks/:id', async (req: Request, res: Response) => {
    try {
      const task = await core.getTask(req.params['id']!);
      res.json(task);
    } catch (err) {
      const msg = (err as Error).message;
      const status = msg.includes('not found') ? 404 : 500;
      res.status(status).json({ error: msg });
    }
  });

  router.put('/api/tasks/:id/stage', async (req: Request, res: Response) => {
    const { stage } = req.body as { stage?: StageName };
    if (!stage) {
      res.status(400).json({ error: 'stage is required' });
      return;
    }
    try {
      await core.moveTask(req.params['id']!, stage);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ── Sign-offs ─────────────────────────────────────────────────────────────

  router.get('/api/signoffs/pending', async (_req: Request, res: Response) => {
    try {
      const pending = await core.listPendingSignoffs();
      res.json(pending);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post('/api/signoffs/:id/approve', async (req: Request, res: Response) => {
    const { actor, note } = req.body as { actor?: string; note?: string };
    if (!actor) {
      res.status(400).json({ error: 'actor is required' });
      return;
    }
    try {
      await core.approveSignoff(req.params['id']!, actor, note);
      res.json({ ok: true });
    } catch (err) {
      const msg = (err as Error).message;
      const status = msg.includes('not found') ? 404 : 500;
      res.status(status).json({ error: msg });
    }
  });

  router.post('/api/signoffs/:id/reject', async (req: Request, res: Response) => {
    const { actor, note } = req.body as { actor?: string; note?: string };
    if (!actor) {
      res.status(400).json({ error: 'actor is required' });
      return;
    }
    try {
      await core.rejectSignoff(req.params['id']!, actor, note);
      res.json({ ok: true });
    } catch (err) {
      const msg = (err as Error).message;
      const status = msg.includes('not found') ? 404 : 500;
      res.status(status).json({ error: msg });
    }
  });

  // ── Events ────────────────────────────────────────────────────────────────

  router.get('/api/events', async (req: Request, res: Response) => {
    const filter: EventFilter = {};
    if (req.query['sprint']) filter.sprint = req.query['sprint'] as string;
    if (req.query['stage']) filter.stage = req.query['stage'] as StageName;
    if (req.query['type'])
      filter.type = req.query['type'] as EventFilter['type'];
    if (req.query['since']) filter.since = req.query['since'] as string;

    try {
      const events = await core.getEvents(
        Object.keys(filter).length > 0 ? filter : undefined,
      );
      res.json(events);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ── Checks ────────────────────────────────────────────────────────────────

  router.post('/api/checks/:name/run', async (req: Request, res: Response) => {
    try {
      const result = await core.runCheck(req.params['name']!);
      res.json(result);
    } catch (err) {
      const msg = (err as Error).message;
      const status = msg.includes('not found') ? 404 : 500;
      res.status(status).json({ error: msg });
    }
  });

  // ── Deploy ────────────────────────────────────────────────────────────────

  router.post('/api/deploy', async (req: Request, res: Response) => {
    const { sprintId } = req.body as { sprintId?: string };
    if (!sprintId) {
      res.status(400).json({ error: 'sprintId is required' });
      return;
    }
    try {
      const result = await core.deploy(sprintId);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ── Adapters ──────────────────────────────────────────────────────────────

  router.get('/api/adapters', (_req: Request, res: Response) => {
    try {
      const adapters = core.listAdapters();
      res.json(adapters);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post('/api/adapters', async (req: Request, res: Response) => {
    const { seam, impl } = req.body as { seam?: AdapterSeam; impl?: string };
    if (!seam || !impl) {
      res.status(400).json({ error: 'seam and impl are required' });
      return;
    }
    try {
      await core.setAdapter(seam, impl);
      res.json({ ok: true, seam, impl });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ── Agent ─────────────────────────────────────────────────────────────────

  router.post('/api/agent', async (req: Request, res: Response) => {
    const { role, task } = req.body as { role?: PersonaRole; task?: string };
    if (!role || !task) {
      res.status(400).json({ error: 'role and task are required' });
      return;
    }
    try {
      const result = await core.runAgent(role, task);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ── Sprint advance ────────────────────────────────────────────────────────

  router.post('/api/sprint/:id/advance', async (req: Request, res: Response) => {
    const { toStage } = req.body as { toStage?: StageName };
    try {
      const result = await core.advanceSprint(req.params['id']!, toStage);
      if (result.ok) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (err) {
      const msg = (err as Error).message;
      const status = msg.includes('not found') || msg.includes('ENOENT') ? 404 : 500;
      res.status(status).json({ error: msg });
    }
  });

  return router;
}
