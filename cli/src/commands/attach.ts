import { Command } from 'commander';
import type { RunEvent } from '@skipper/core';
import { getCore } from '../client.js';

export function registerAttach(program: Command): void {
  program
    .command('attach <repo>')
    .description('Attach Skipper to an existing repository and run intake')
    .option('--json', 'Output events as a JSON array')
    .option('--repo <path>', 'Path to the repository (default: first positional arg)')
    .action(async (repo: string, opts: { json?: boolean; repo?: string }) => {
      try {
        const repoPath = opts.repo ?? repo;
        const core = await getCore(repoPath);

        // 1. Initialize the .skipper/ layout
        await core.initProject(repoPath);

        // 2. Check if understanding.md already exists
        try {
          await core.state.readUnderstanding();
          console.log('Already attached. Re-running intake...');
        } catch {
          // Not yet initialized — that's fine, initProject handled it
        }

        // 3. Plan the intake sprint
        const sprintResult = await core.planSprint('Project intake', 'INTAKE');
        const sprintId = sprintResult.id;

        // 4. Drive the intake stage with runSprint
        const events: RunEvent[] = [];
        let lastEventType: string | undefined;

        for await (const event of core.runSprint(sprintId, { stage: 'intake' })) {
          lastEventType = event.type;
          if (opts.json) {
            events.push(event);
          } else {
            const detail =
              typeof event.data === 'string'
                ? event.data
                : JSON.stringify(event.data);
            console.log(`[${event.type}] ${detail}`);
          }
        }

        if (opts.json) {
          console.log(JSON.stringify(events, null, 2));
        }

        if (lastEventType === 'error') {
          process.exit(1);
        }

        // 5 & 6. Summary and next steps
        console.log(
          `Attached to ${repoPath}. understanding.md written to .skipper/understanding.md`
        );
        console.log(
          "Next: skipper sprint plan '<goal>'  to start your first sprint"
        );
      } catch (err: unknown) {
        console.error((err as Error).message);
        process.exit(1);
      }
    });
}
