import { Command } from 'commander';
import { getCore } from '../client.js';

function ensureHumanPrefix(actor: string): string {
  return actor.startsWith('human:') ? actor : `human:${actor}`;
}

export function registerSignoff(program: Command): void {
  const signoff = program.command('signoff').description('Manage sign-offs');

  signoff
    .command('list')
    .description('List pending sign-off requests')
    .option('--repo <path>', 'Path to the repository (default: cwd)')
    .option('--json', 'Output as JSON')
    .action(async (opts: { repo?: string; json?: boolean }) => {
      try {
        const core = await getCore(opts.repo);
        const pending = await core.listPendingSignoffs();

        if (opts.json) {
          console.log(JSON.stringify(pending, null, 2));
          process.exit(0);
        }

        if (pending.length === 0) {
          console.log('No pending sign-offs.');
          return;
        }

        for (const req of pending) {
          console.log(`[${req.id}] sprint=${req.sprint} stage=${req.stage}`);
          console.log(`  Reason: ${req.reason}`);
          console.log(`  At:     ${req.ts}`);
        }
      } catch (err: unknown) {
        console.error((err as Error).message);
        process.exit(1);
      }
    });

  signoff
    .command('approve <id>')
    .description('Approve a sign-off request')
    .option('--note <text>', 'Optional approval note')
    .option('--actor <id>', 'Actor identifier (default: cli)', 'cli')
    .option('--repo <path>', 'Path to the repository (default: cwd)')
    .action(
      async (id: string, opts: { note?: string; actor: string; repo?: string }) => {
        try {
          const core = await getCore(opts.repo);
          const actor = ensureHumanPrefix(opts.actor);
          await core.approveSignoff(id, actor, opts.note);
          console.log(`Approved sign-off ${id} as ${actor}`);
        } catch (err: unknown) {
          console.error((err as Error).message);
          process.exit(1);
        }
      }
    );

  signoff
    .command('reject <id>')
    .description('Reject a sign-off request')
    .option('--note <text>', 'Optional rejection note')
    .option('--actor <id>', 'Actor identifier (default: cli)', 'cli')
    .option('--repo <path>', 'Path to the repository (default: cwd)')
    .action(
      async (id: string, opts: { note?: string; actor: string; repo?: string }) => {
        try {
          const core = await getCore(opts.repo);
          const actor = ensureHumanPrefix(opts.actor);
          await core.rejectSignoff(id, actor, opts.note);
          console.log(`Rejected sign-off ${id} as ${actor}`);
        } catch (err: unknown) {
          console.error((err as Error).message);
          process.exit(1);
        }
      }
    );
}
