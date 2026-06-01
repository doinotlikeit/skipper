import { Command } from 'commander';
import type { StageName } from '@skipper/core';
import { getCore } from '../client.js';

export function registerTask(program: Command): void {
  const task = program.command('task').description('Manage tasks');

  task
    .command('list')
    .description('List tasks for a sprint')
    .option('--sprint <id>', 'Sprint ID (default: active sprint)')
    .option('--repo <path>', 'Path to the repository (default: cwd)')
    .option('--json', 'Output as JSON')
    .action(async (opts: { sprint?: string; repo?: string; json?: boolean }) => {
      try {
        const core = await getCore(opts.repo);
        const tasks = await core.listTasks(opts.sprint);

        if (opts.json) {
          console.log(JSON.stringify(tasks, null, 2));
          process.exit(0);
        }

        if (tasks.length === 0) {
          console.log('No tasks found.');
          return;
        }

        console.log(
          `${'ID'.padEnd(30)} ${'STAGE'.padEnd(12)} ${'STATUS'.padEnd(14)} OWNER`
        );
        console.log('-'.repeat(72));
        for (const t of tasks) {
          console.log(
            `${t.id.padEnd(30)} ${t.stage.padEnd(12)} ${t.status.padEnd(14)} ${t.owner ?? ''}`
          );
        }
      } catch (err: unknown) {
        console.error((err as Error).message);
        process.exit(1);
      }
    });

  task
    .command('show <id>')
    .description('Show details of a task')
    .option('--repo <path>', 'Path to the repository (default: cwd)')
    .option('--json', 'Output as JSON')
    .action(async (id: string, opts: { repo?: string; json?: boolean }) => {
      try {
        const core = await getCore(opts.repo);
        const t = await core.getTask(id);

        if (opts.json) {
          console.log(JSON.stringify(t, null, 2));
          process.exit(0);
        }

        console.log(`ID:     ${t.id}`);
        console.log(`Sprint: ${t.sprint}`);
        console.log(`Stage:  ${t.stage}`);
        console.log(`Title:  ${t.title}`);
        console.log(`Status: ${t.status}`);
        if (t.owner) {
          console.log(`Owner:  ${t.owner}`);
        }
      } catch (err: unknown) {
        console.error((err as Error).message);
        process.exit(1);
      }
    });

  task
    .command('move <id> <stage>')
    .description('Move a task to a different stage')
    .option('--repo <path>', 'Path to the repository (default: cwd)')
    .action(async (id: string, stage: string, opts: { repo?: string }) => {
      try {
        const core = await getCore(opts.repo);
        await core.moveTask(id, stage as StageName);
        console.log(`Moved task ${id} to stage ${stage}`);
      } catch (err: unknown) {
        console.error((err as Error).message);
        process.exit(1);
      }
    });
}
