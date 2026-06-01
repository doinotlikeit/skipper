import type { PersonaRole, PersonaAdapter, AdapterSet } from '@skipper/core';
import { ClaudePersonaAdapter } from './persona.js';
import type { ClaudePersonaOptions } from './persona.js';
import { ClaudeConductorAdapter } from './conductor.js';
import { TestsCheckAdapter, SecurityCheckAdapter } from '../checks/command.js';
import { CommandDeployAdapter } from '../deploy/command.js';

export { ClaudePersonaAdapter } from './persona.js';
export type { ClaudePersonaOptions } from './persona.js';
export { ClaudeConductorAdapter } from './conductor.js';
export { SYSTEM_PROMPTS } from './prompts.js';

const PERSONA_ROLES: PersonaRole[] = [
  'architect',
  'coder',
  'reviewer',
  'qa',
  'security',
  'release',
  'sre',
];

/**
 * Create Claude-backed conductor and persona adapters, paired with real
 * command-backed `tests` and `security` checks and a `ci` deploy adapter.
 *
 * @param skipperDir  Path to the .skipper directory (unused by Claude adapters
 *                    directly but reserved for future credential/config loading).
 * @param opts        Model and token options forwarded to each persona.
 */
export function createClaudeAdapters(
  _skipperDir: string,
  opts?: ClaudePersonaOptions,
): Pick<AdapterSet, 'conductor' | 'persona' | 'checks' | 'deploy'> {
  const personaMap = new Map<PersonaRole, PersonaAdapter>(
    PERSONA_ROLES.map((role) => [role, new ClaudePersonaAdapter(role, opts)]),
  );

  return {
    conductor: new ClaudeConductorAdapter(personaMap, opts),
    persona: personaMap,
    checks: [new TestsCheckAdapter(), new SecurityCheckAdapter()],
    deploy: new CommandDeployAdapter(),
  };
}
