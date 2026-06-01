import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { MarkdownRoadmapAdapter } from '../markdown/roadmap.js';

describe('MarkdownRoadmapAdapter', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'skipper-roadmap-'));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('parses headings regardless of separator (em-dash, en-dash, hyphen, colon)', async () => {
    await fs.writeFile(
      path.join(dir, 'roadmap.md'),
      [
        '# Skipper roadmap',
        '',
        '## INIT-1 — Em dash title',
        '## INIT-2 – En dash title',
        '## INIT-3 - Hyphen title',
        '## INIT-4: Colon title',
        '',
      ].join('\n'),
      'utf8',
    );

    const adapter = new MarkdownRoadmapAdapter(dir);
    const initiatives = await adapter.listInitiatives();

    expect(initiatives.map((i) => i.id)).toEqual(['INIT-1', 'INIT-2', 'INIT-3', 'INIT-4']);
    expect(initiatives.map((i) => i.text)).toEqual([
      'Em dash title',
      'En dash title',
      'Hyphen title',
      'Colon title',
    ]);
  });

  it('round-trips an added initiative (writes em-dash, parses it back)', async () => {
    const adapter = new MarkdownRoadmapAdapter(dir);
    const added = await adapter.addInitiative('A brand new thing');
    expect(added.id).toBe('INIT-1');

    const raw = await fs.readFile(path.join(dir, 'roadmap.md'), 'utf8');
    expect(raw).toContain('## INIT-1 — A brand new thing');

    const initiatives = await adapter.listInitiatives();
    expect(initiatives).toHaveLength(1);
    expect(initiatives[0]).toMatchObject({ id: 'INIT-1', text: 'A brand new thing' });
  });

  it('assigns the next sequential id when initiatives already exist', async () => {
    const adapter = new MarkdownRoadmapAdapter(dir);
    await adapter.addInitiative('first');
    const second = await adapter.addInitiative('second');
    expect(second.id).toBe('INIT-2');
  });

  it('captures sprint_refs comments under a heading', async () => {
    await fs.writeFile(
      path.join(dir, 'roadmap.md'),
      ['## INIT-1 — Has refs', '<!-- sprint_refs: sprint-01, sprint-02 -->', ''].join('\n'),
      'utf8',
    );
    const adapter = new MarkdownRoadmapAdapter(dir);
    const [init] = await adapter.listInitiatives();
    expect(init.sprint_refs).toEqual(['sprint-01', 'sprint-02']);
  });
});
