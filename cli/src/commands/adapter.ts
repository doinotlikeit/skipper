import { Command } from 'commander';
import type { AdapterSeam } from '@skipper/core';
import { getCore } from '../client.js';

export function registerAdapter(program: Command): void {
  const adapter = program.command('adapter').description('Manage adapters');

  adapter
    .command('list')
    .description('List configured adapters and available implementations')
    .option('--repo <path>', 'Path to the repository (default: cwd)')
    .option('--json', 'Output as JSON')
    .action(async (opts: { repo?: string; json?: boolean }) => {
      try {
        const core = await getCore(opts.repo);
        const adapters = core.listAdapters();

        if (opts.json) {
          console.log(JSON.stringify(adapters, null, 2));
          process.exit(0);
        }

        if (adapters.length === 0) {
          console.log('No adapters registered.');
          return;
        }

        console.log(`${'SEAM'.padEnd(14)} ${'IMPL'.padEnd(20)} AVAILABLE`);
        console.log('-'.repeat(60));
        for (const a of adapters) {
          console.log(
            `${a.seam.padEnd(14)} ${a.impl.padEnd(20)} ${a.available.join(', ')}`
          );
        }
      } catch (err: unknown) {
        console.error((err as Error).message);
        process.exit(1);
      }
    });

  adapter
    .command('use <seam> <impl>')
    .description('Switch the implementation for an adapter seam')
    .option('--repo <path>', 'Path to the repository (default: cwd)')
    .action(async (seam: string, impl: string, opts: { repo?: string }) => {
      try {
        const core = await getCore(opts.repo);
        await core.setAdapter(seam as AdapterSeam, impl);
        console.log(`Adapter ${seam} set to ${impl}`);
      } catch (err: unknown) {
        console.error((err as Error).message);
        process.exit(1);
      }
    });
}
