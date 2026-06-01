import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Initiative } from '@skipper/core';
import type { RoadmapAdapter } from '@skipper/core';

// ---------------------------------------------------------------------------
// Roadmap file format:
//
// # Roadmap
//
// ## INIT-1 — some initiative text
// <!-- sprint_refs: sprint-01, sprint-02 -->
//
// ## INIT-2 — another initiative
//
// The separator after the ID may be an em-dash (—, the authored convention),
// an en-dash (–), a hyphen (-), or a colon (:), each optionally spaced.
// ---------------------------------------------------------------------------

const HEADING_RE = /^## (INIT-(\d+))\s*(?::|[—–-])\s*(.+)$/;
const SPRINT_REFS_RE = /^<!-- sprint_refs: (.+) -->$/;

export class MarkdownRoadmapAdapter implements RoadmapAdapter {
  private readonly filePath: string;

  constructor(private readonly skipperDir: string) {
    this.filePath = path.join(skipperDir, 'roadmap.md');
  }

  async listInitiatives(): Promise<Initiative[]> {
    const content = this.readFile();
    return parseInitiatives(content);
  }

  async addInitiative(text: string): Promise<Initiative> {
    const existing = await this.listInitiatives();
    const nextN = nextInitiativeNumber(existing);
    const id = `INIT-${nextN}`;

    const section = `\n## ${id} — ${text}\n`;
    this.appendToFile(section);

    return { id, text, sprint_refs: [] };
  }

  async link(sprintId: string, initiativeId: string): Promise<void> {
    const content = this.readFile();
    const lines = content.split('\n');
    const updated = updateSprintRefs(lines, initiativeId, sprintId);
    this.writeFile(updated.join('\n'));
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private readFile(): string {
    if (!fs.existsSync(this.filePath)) {
      const dir = path.dirname(this.filePath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, '# Roadmap\n', 'utf8');
      return '# Roadmap\n';
    }
    return fs.readFileSync(this.filePath, 'utf8');
  }

  private writeFile(content: string): void {
    fs.writeFileSync(this.filePath, content, 'utf8');
  }

  private appendToFile(section: string): void {
    const current = this.readFile();
    // Ensure file ends with exactly one newline before appending
    const trimmed = current.trimEnd();
    this.writeFile(trimmed + '\n' + section);
  }
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function parseInitiatives(content: string): Initiative[] {
  const lines = content.split('\n');
  const initiatives: Initiative[] = [];
  let current: Initiative | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = HEADING_RE.exec(line);

    if (headingMatch) {
      if (current) {
        initiatives.push(current);
      }
      current = {
        id: headingMatch[1],
        text: headingMatch[3].trim(),
        sprint_refs: [],
      };
      continue;
    }

    if (current) {
      const refsMatch = SPRINT_REFS_RE.exec(line.trim());
      if (refsMatch) {
        current.sprint_refs = refsMatch[1]
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      }
    }
  }

  if (current) {
    initiatives.push(current);
  }

  return initiatives;
}

function nextInitiativeNumber(existing: Initiative[]): number {
  if (existing.length === 0) return 1;
  const numbers = existing.map((i) => {
    const m = /^INIT-(\d+)$/.exec(i.id);
    return m ? parseInt(m[1], 10) : 0;
  });
  return Math.max(...numbers) + 1;
}

function updateSprintRefs(
  lines: string[],
  initiativeId: string,
  sprintId: string
): string[] {
  const result: string[] = [];
  let insideTarget = false;
  let refsLineIndex = -1;
  let headingLineIndex = -1;

  // First pass: find the target section boundaries
  for (let i = 0; i < lines.length; i++) {
    const headingMatch = HEADING_RE.exec(lines[i]);
    if (headingMatch) {
      if (headingMatch[1] === initiativeId) {
        insideTarget = true;
        headingLineIndex = i;
      } else if (insideTarget) {
        // We've entered a new heading — section ended
        insideTarget = false;
      }
    }
    if (insideTarget && i > headingLineIndex) {
      const refsMatch = SPRINT_REFS_RE.exec(lines[i].trim());
      if (refsMatch) {
        refsLineIndex = i;
      }
    }
  }

  if (headingLineIndex === -1) {
    // Initiative not found — return unchanged
    return lines;
  }

  if (refsLineIndex !== -1) {
    // Update existing sprint_refs comment
    const refsMatch = SPRINT_REFS_RE.exec(lines[refsLineIndex].trim());
    const existing = refsMatch
      ? refsMatch[1]
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    if (!existing.includes(sprintId)) {
      existing.push(sprintId);
    }
    return lines.map((line, i) =>
      i === refsLineIndex ? `<!-- sprint_refs: ${existing.join(', ')} -->` : line
    );
  } else {
    // Insert sprint_refs comment after the heading line
    return [
      ...lines.slice(0, headingLineIndex + 1),
      `<!-- sprint_refs: ${sprintId} -->`,
      ...lines.slice(headingLineIndex + 1),
    ];
  }
}
