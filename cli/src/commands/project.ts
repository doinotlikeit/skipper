import { Command } from 'commander';
import { getCore } from '../client.js';

export function registerProject(program: Command): void {
  const project = program.command('project').description('Manage the Skipper project');

  project
    .command('init')
    .description('Initialize Skipper in a repository')
    .option('--repo <path>', 'Path to the repository (default: cwd)')
    .action(async (opts: { repo?: string }) => {
      try {
        const core = await getCore(opts.repo);
        await core.initProject(opts.repo ?? process.cwd());
        console.log(`Skipper initialized at ${opts.repo ?? process.cwd()}`);
      } catch (err: unknown) {
        console.error((err as Error).message);
        process.exit(1);
      }
    });

  project
    .command('status')
    .description('Show project status')
    .option('--repo <path>', 'Path to the repository (default: cwd)')
    .option('--json', 'Output as JSON')
    .action(async (opts: { repo?: string; json?: boolean }) => {
      try {
        const core = await getCore(opts.repo);
        const status = await core.getProjectStatus();

        if (opts.json) {
          console.log(JSON.stringify(status, null, 2));
          process.exit(0);
        }

        console.log(`Repo:    ${status.repoPath}`);
        console.log(`Sprints: ${status.sprints}`);
        if (status.activeSprint) {
          console.log(`Active:  ${status.activeSprint.id} — ${status.activeSprint.goal}`);
        } else {
          console.log('Active:  (none)');
        }
      } catch (err: unknown) {
        console.error((err as Error).message);
        process.exit(1);
      }
    });
}
