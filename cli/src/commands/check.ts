import { Command } from 'commander';
import { getCore } from '../client.js';

export function registerCheck(program: Command): void {
  const check = program.command('check').description('Run checks');

  check
    .command('run <name>')
    .description('Run a named check')
    .option('--repo <path>', 'Path to the repository (default: cwd)')
    .option('--json', 'Output as JSON')
    .action(async (name: string, opts: { repo?: string; json?: boolean }) => {
      try {
        const core = await getCore(opts.repo);
        const result = await core.runCheck(name);

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          process.exit(0);
        }

        const status = result.passed ? 'PASSED' : 'FAILED';
        console.log(`Check: ${result.name}  [${status}]`);
        console.log(`At:    ${result.ts}`);
        if (result.output) {
          console.log('');
          console.log(result.output);
        }

        if (!result.passed) {
          process.exit(1);
        }
      } catch (err: unknown) {
        console.error((err as Error).message);
        process.exit(1);
      }
    });
}
