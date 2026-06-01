import { Command } from 'commander';
import type { RunEvent } from '@skipper/core';
import { getCore } from '../client.js';

export function registerSprint(program: Command): void {
  const sprint = program.command('sprint').description('Manage sprints');

  sprint
    .command('plan [goal]')
    .description('Plan a new sprint (goal optional when --from is given)')
    .option('--from <initiative>', 'Initiative ID to plan from / link (roadmap ref)')
    .option('--repo <path>', 'Path to the repository (default: cwd)')
    .option('--json', 'Output as JSON')
    .action(async (goal: string | undefined, opts: { from?: string; repo?: string; json?: boolean }) => {
      try {
        const core = await getCore(opts.repo);

        // Per spec/05, `sprint plan --from <initiative>` derives the goal from
        // the roadmap initiative when no explicit goal is supplied.
        let resolvedGoal = goal;
        if (!resolvedGoal) {
          if (!opts.from) {
            console.error('Provide a goal, or --from <initiative> to plan from the roadmap.');
            process.exit(1);
          }
          const initiatives = await core.getRoadmap();
          const initiative = initiatives.find((i) => i.id === opts.from);
          if (!initiative) {
            console.error(`Initiative not found in roadmap: ${opts.from}`);
            process.exit(1);
          }
          resolvedGoal = initiative.text;
        }

        const sprintResult = await core.planSprint(resolvedGoal, opts.from);

        if (opts.json) {
          console.log(JSON.stringify(sprintResult, null, 2));
          process.exit(0);
        }

        console.log(`Sprint planned: ${sprintResult.id}`);
        console.log(`Goal:  ${sprintResult.goal}`);
        if (sprintResult.roadmap_ref) {
          console.log(`Ref:   ${sprintResult.roadmap_ref}`);
        }
        console.log(`Stages: ${sprintResult.stages.map((s) => s.name).join(' → ')}`);
      } catch (err: unknown) {
        console.error((err as Error).message);
        process.exit(1);
      }
    });

  sprint
    .command('run [id]')
    .description('Run the sprint (or a specific sprint by id), driving all stages')
    .option('--stage <name>', 'Target a specific stage only')
    .option('--watch', 'Stream events as they arrive')
    .option('--repo <path>', 'Path to the repository (default: cwd)')
    .option('--json', 'Output events as a JSON array')
    .action(
      async (
        id: string | undefined,
        opts: { stage?: string; watch?: boolean; repo?: string; json?: boolean }
      ) => {
        try {
          const core = await getCore(opts.repo);

          let sprintId = id;
          if (!sprintId) {
            const status = await core.getProjectStatus();
            if (!status.activeSprint) {
              console.error('No active sprint. Start one with: skipper sprint plan [goal] [--from <initiative>]');
              process.exit(1);
            }
            sprintId = status.activeSprint.id;
          }

          const events: RunEvent[] = [];
          let lastEventType: string | undefined;

          for await (const event of core.runSprint(sprintId, { stage: opts.stage as import('@skipper/core').StageName | undefined, watch: opts.watch })) {
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
        } catch (err: unknown) {
          console.error((err as Error).message);
          process.exit(1);
        }
      }
    );

  sprint
    .command('status [id]')
    .description('Show sprint status (active sprint if no id given)')
    .option('--repo <path>', 'Path to the repository (default: cwd)')
    .option('--json', 'Output as JSON')
    .action(async (id: string | undefined, opts: { repo?: string; json?: boolean }) => {
      try {
        const core = await getCore(opts.repo);

        let sprintId = id;
        if (!sprintId) {
          const projectStatus = await core.getProjectStatus();
          if (!projectStatus.activeSprint) {
            console.log('No active sprint.');
            return;
          }
          sprintId = projectStatus.activeSprint.id;
        }

        const { sprint, currentStage } = await core.getSprintStatus(sprintId);

        if (opts.json) {
          console.log(JSON.stringify({ sprint, currentStage }, null, 2));
          process.exit(0);
        }

        console.log(`Sprint:  ${sprint.id} — ${sprint.goal}`);
        console.log(
          `Current: ${currentStage ? `${currentStage.name} (${currentStage.status})` : '(complete)'}`
        );
        console.log('');
        console.log('Stages:');
        for (const stage of sprint.stages) {
          const marker =
            currentStage && currentStage.name === stage.name ? '→' : ' ';
          console.log(`  ${marker} ${stage.name.padEnd(10)} ${stage.status}`);
        }
      } catch (err: unknown) {
        console.error((err as Error).message);
        process.exit(1);
      }
    });
}
