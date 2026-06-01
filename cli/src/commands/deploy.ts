import { Command } from 'commander';
import { getCore } from '../client.js';

export function registerDeploy(program: Command): void {
  program
    .command('deploy')
    .description('Deploy a sprint')
    .option('--sprint <id>', 'Sprint ID (default: active sprint)')
    .option('--repo <path>', 'Path to the repository (default: cwd)')
    .option('--json', 'Output as JSON')
    .action(async (opts: { sprint?: string; repo?: string; json?: boolean }) => {
      try {
        const core = await getCore(opts.repo);

        let sprintId = opts.sprint;
        if (!sprintId) {
          const status = await core.getProjectStatus();
          if (!status.activeSprint) {
            console.error('No active sprint. Specify one with --sprint <id>');
            process.exit(1);
          }
          sprintId = status.activeSprint.id;
        }

        const result = await core.deploy(sprintId);

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          process.exit(0);
        }

        const status = result.success ? 'SUCCESS' : 'FAILED';
        console.log(`Deploy [${status}] sprint=${sprintId}`);
        console.log(`At:    ${result.ts}`);
        if (result.output) {
          console.log('');
          console.log(result.output);
        }

        if (!result.success) {
          process.exit(1);
        }
      } catch (err: unknown) {
        console.error((err as Error).message);
        process.exit(1);
      }
    });
}
