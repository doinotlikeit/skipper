import { Command } from 'commander';
import type { PersonaRole } from '@skipper/core';
import { getCore } from '../client.js';

export function registerAgent(program: Command): void {
  program
    .command('agent <role> <task>')
    .description('Run an agent persona for a task')
    .option('--repo <path>', 'Path to the repository (default: cwd)')
    .option('--json', 'Output as JSON')
    .action(async (role: string, task: string, opts: { repo?: string; json?: boolean }) => {
      try {
        const core = await getCore(opts.repo);
        const result = await core.runAgent(role as PersonaRole, task);

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          process.exit(0);
        }

        const status = result.success ? 'SUCCESS' : 'FAILED';
        console.log(`Agent: ${result.role}  [${status}]`);
        console.log(`Task:  ${result.task}`);
        console.log('');
        console.log(result.output);

        if (!result.success) {
          process.exit(1);
        }
      } catch (err: unknown) {
        console.error((err as Error).message);
        process.exit(1);
      }
    });
}
