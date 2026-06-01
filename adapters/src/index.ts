import type { AdapterSet, PersonaAdapter, PersonaRole, SkipperConfig } from '@skipper/core';
import {
  StubConductorAdapter,
  StubPersonaAdapter,
  StubRoadmapAdapter,
  StubWorkBoardAdapter,
} from './stub/index.js';
import { MarkdownRoadmapAdapter } from './markdown/roadmap.js';
import { MarkdownWorkBoardAdapter } from './markdown/workboard.js';
import { createClaudeAdapters, ClaudeConductorAdapter } from './claude/index.js';
import { ClaudeCodePersonaAdapter } from './claude-code/persona.js';
import { TestsCheckAdapter, SecurityCheckAdapter } from './checks/command.js';
import { CommandDeployAdapter } from './deploy/command.js';
import { resolveBackend } from './backend.js';

export { createStubAdapters } from './stub/index.js';
export { MarkdownRoadmapAdapter } from './markdown/roadmap.js';
export { MarkdownWorkBoardAdapter } from './markdown/workboard.js';
export { createClaudeAdapters } from './claude/index.js';
export { ClaudeCodePersonaAdapter } from './claude-code/persona.js';
export type { ClaudeCodeOptions } from './claude-code/persona.js';
export { resolveBackend, claudeCliAvailable, apiKeyAvailable } from './backend.js';
export type { AgentBackend, BackendProbes } from './backend.js';
export {
  CommandCheckAdapter,
  TestsCheckAdapter,
  SecurityCheckAdapter,
} from './checks/command.js';
export { CommandDeployAdapter } from './deploy/command.js';
export type { CommandDeployOptions } from './deploy/command.js';

const PERSONA_ROLES: PersonaRole[] = [
  'architect',
  'coder',
  'reviewer',
  'qa',
  'security',
  'release',
  'sre',
];

// ---------------------------------------------------------------------------
// createDefaultAdapters — markdown adapters for roadmap + workboard;
// stub adapters for conductor, persona, checks, and deploy.
// ---------------------------------------------------------------------------

export function createDefaultAdapters(skipperDir: string): AdapterSet {
  const personaMap = new Map(
    PERSONA_ROLES.map((role) => [role, new StubPersonaAdapter(role)])
  );

  return {
    roadmap: new MarkdownRoadmapAdapter(skipperDir),
    workboard: new MarkdownWorkBoardAdapter(skipperDir),
    conductor: new StubConductorAdapter(),
    persona: personaMap,
    // Checks and deploy are real command-backed adapters (no AI/API key
    // needed) — they execute the repo's own test/audit/deploy commands.
    // The conductor/persona stay stubs until the Claude runtime is wired in.
    checks: [new TestsCheckAdapter(), new SecurityCheckAdapter()],
    deploy: new CommandDeployAdapter(),
  };
}

// ---------------------------------------------------------------------------
// createAdapters — top-level factory. Roadmap/workboard are always markdown and
// checks/deploy are always the real command adapters. The conductor/persona are
// selected by the resolved agent backend (spec/04): the Claude Code CLI by
// default, the embedded Anthropic SDK if only an API key is present, else the
// stub crew (loop + gates run; build is a placeholder).
// ---------------------------------------------------------------------------

export function createAdapters(skipperDir: string, config: SkipperConfig): AdapterSet {
  const base = createDefaultAdapters(skipperDir);
  const backend = resolveBackend(config);

  if (backend === 'stub') {
    console.warn(
      '[skipper] No agent backend available: the sprint loop, gates, and sign-offs ' +
        'run, but the build stage produces a placeholder, not a real diff. Install the ' +
        'Claude Code CLI, set ANTHROPIC_API_KEY, or pin `backend:` in .skipper/config.yaml.',
    );
    return base; // createDefaultAdapters supplies the stub conductor + personas.
  }

  const opts = {
    model: config.models?.coder ?? 'claude-sonnet-4-6',
    verifierModel: config.models?.reviewer ?? 'claude-opus-4-7',
  };

  if (backend === 'api') {
    // Embedded Anthropic SDK conductor + personas; checks/deploy stay real.
    const claude = createClaudeAdapters(skipperDir, opts);
    return { ...base, conductor: claude.conductor, persona: claude.persona };
  }

  // backend === 'claude-code': shell out to the local Claude Code CLI.
  const personaMap = new Map<PersonaRole, PersonaAdapter>(
    PERSONA_ROLES.map((role) => [role, new ClaudeCodePersonaAdapter(role, opts)]),
  );
  return {
    ...base,
    conductor: new ClaudeConductorAdapter(personaMap, opts),
    persona: personaMap,
  };
}
