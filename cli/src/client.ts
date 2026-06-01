import path from 'node:path';
import { Core, FileState } from '@skipper/core';
import { createAdapters } from '@skipper/adapters';

/**
 * Resolves the repo path (provided or CWD), reads config from .skipper/config.yaml,
 * selects the appropriate adapters (Claude or stub), and returns a ready-to-use Core instance.
 */
export async function getCore(repoPath?: string): Promise<Core> {
  const resolvedPath = repoPath ? path.resolve(repoPath) : process.cwd();
  const state = new FileState(resolvedPath);

  // Read config — fall back to stub defaults if .skipper/ doesn't exist yet
  let config;
  try {
    config = await state.readConfig();
  } catch {
    config = {
      adapters: {
        roadmap: 'markdown',
        workboard: 'markdown',
        conductor: 'stub',
        persona: 'stub',
        check: ['stub'],
        deploy: 'stub',
      },
    };
  }

  const adapters = createAdapters(state.skipperDir, config);
  const core = new Core(state, adapters);
  await core.loadConfig().catch(() => {});
  return core;
}
