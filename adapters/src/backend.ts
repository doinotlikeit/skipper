import { existsSync } from 'fs';
import path from 'path';
import type { AgentBackend, SkipperConfig } from '@skipper/core';

export type { AgentBackend } from '@skipper/core';

/**
 * Probes used to detect available backends. Injectable so the resolution logic
 * can be unit-tested without a real CLI install or environment key.
 */
export interface BackendProbes {
  /** True when the Claude Code CLI (`claude`) is on PATH. */
  hasClaudeCli: () => boolean;
  /** True when an Anthropic API key is present in the environment. */
  hasApiKey: () => boolean;
}

/**
 * Detect whether the `claude` binary is resolvable on the current PATH, without
 * spawning a subprocess (a plain PATH scan — fast and side-effect free).
 */
export function claudeCliAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  const PATH = env['PATH'] ?? '';
  const exts = process.platform === 'win32' ? ['.cmd', '.exe', '.bat', ''] : [''];
  for (const dir of PATH.split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      if (existsSync(path.join(dir, `claude${ext}`))) return true;
    }
  }
  return false;
}

export function apiKeyAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env['ANTHROPIC_API_KEY']);
}

const DEFAULT_PROBES: BackendProbes = {
  hasClaudeCli: () => claudeCliAvailable(),
  hasApiKey: () => apiKeyAvailable(),
};

/**
 * Resolve which agent backend the conductor/persona adapters should run on.
 *
 * Order (spec/04 — Agent backend resolution):
 *   1. An explicit `backend:` pin in config wins.
 *   2. The locally-installed Claude Code CLI (`claude-code`).
 *   3. An `ANTHROPIC_API_KEY` in the environment (`api`).
 *   4. The logging stub (`stub`) — the loop still runs; build is a placeholder.
 */
export function resolveBackend(
  config?: Pick<SkipperConfig, 'backend'>,
  probes: Partial<BackendProbes> = {},
): AgentBackend {
  const pin = config?.backend;
  if (pin === 'claude-code' || pin === 'api' || pin === 'stub') return pin;

  const { hasClaudeCli, hasApiKey } = { ...DEFAULT_PROBES, ...probes };
  if (hasClaudeCli()) return 'claude-code';
  if (hasApiKey()) return 'api';
  return 'stub';
}
