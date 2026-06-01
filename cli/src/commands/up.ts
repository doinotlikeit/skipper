import { Command } from 'commander';
import { startServer } from '@skipper/core';
import { createAdapters } from '@skipper/adapters';
import { FileState } from '@skipper/core';
import * as path from 'node:path';

export function registerUp(program: Command): void {
  program
    .command('up')
    .description('Start the Skipper server (Core + UI + runtime)')
    .option('--port <n>', 'Port to listen on', '3000')
    .option('--repo <path>', 'Path to the repository (default: cwd)')
    .action(async (opts: { port: string; repo?: string }) => {
      try {
        const repoPath = opts.repo ? path.resolve(opts.repo) : process.cwd();
        const port = parseInt(opts.port, 10);
        const state = new FileState(repoPath);
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

        console.log(`Starting Skipper on port ${port} for ${repoPath}...`);
        await startServer({ port, repoPath, adapters });
        console.log(`Skipper is running at http://localhost:${port}`);
      } catch (err: unknown) {
        console.error((err as Error).message);
        process.exit(1);
      }
    });
}
