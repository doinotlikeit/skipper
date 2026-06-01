import { Command } from 'commander';
import { getCore } from '../client.js';

export function registerRoadmap(program: Command): void {
  const roadmap = program.command('roadmap').description('Manage the product roadmap');

  roadmap
    .command('show')
    .description('List all initiatives')
    .option('--repo <path>', 'Path to the repository (default: cwd)')
    .option('--json', 'Output as JSON')
    .action(async (opts: { repo?: string; json?: boolean }) => {
      try {
        const core = await getCore(opts.repo);
        const initiatives = await core.getRoadmap();

        if (opts.json) {
          console.log(JSON.stringify(initiatives, null, 2));
          process.exit(0);
        }

        if (initiatives.length === 0) {
          console.log('No initiatives found.');
          return;
        }
        for (const initiative of initiatives) {
          const refs =
            initiative.sprint_refs && initiative.sprint_refs.length > 0
              ? `  [${initiative.sprint_refs.join(', ')}]`
              : '';
          console.log(`${initiative.id}: ${initiative.text}${refs}`);
        }
      } catch (err: unknown) {
        console.error((err as Error).message);
        process.exit(1);
      }
    });

  roadmap
    .command('add <goal>')
    .description('Add a new initiative to the roadmap')
    .option('--repo <path>', 'Path to the repository (default: cwd)')
    .option('--json', 'Output as JSON')
    .action(async (goal: string, opts: { repo?: string; json?: boolean }) => {
      try {
        const core = await getCore(opts.repo);
        const initiative = await core.addInitiative(goal);

        if (opts.json) {
          console.log(JSON.stringify(initiative, null, 2));
          process.exit(0);
        }

        console.log(`Added initiative ${initiative.id}: ${initiative.text}`);
      } catch (err: unknown) {
        console.error((err as Error).message);
        process.exit(1);
      }
    });
}
