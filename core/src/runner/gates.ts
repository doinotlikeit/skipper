import type { StageName } from '../types.js';
import type { FileState } from '../state/index.js';

export async function checkGate(
  stage: StageName,
  sprintId: string,
  state: FileState,
): Promise<{ passes: boolean; reason?: string }> {
  switch (stage) {
    case 'intake': {
      const events = await state.readEvents({
        sprint: sprintId,
        stage: 'intake',
        type: 'artifact',
      });
      if (events.length === 0) {
        return {
          passes: false,
          reason: 'intake gate requires an artifact event to be recorded',
        };
      }
      return { passes: true };
    }

    case 'adr': {
      const signOff = await state.getSignOff(sprintId, 'adr');
      if (!signOff || !signOff.actor.startsWith('human:')) {
        return {
          passes: false,
          reason: 'adr gate requires a human sign-off (actor must start with human:)',
        };
      }
      return { passes: true };
    }

    case 'plan': {
      const events = await state.readEvents({
        sprint: sprintId,
        stage: 'plan',
        type: 'artifact',
      });
      if (events.length === 0) {
        return {
          passes: false,
          reason: 'plan gate requires an artifact event to be recorded',
        };
      }
      return { passes: true };
    }

    case 'build': {
      const events = await state.readEvents({
        sprint: sprintId,
        stage: 'build',
        type: 'artifact',
      });
      if (events.length === 0) {
        return {
          passes: false,
          reason: 'build gate requires an artifact event (build succeeded)',
        };
      }
      return { passes: true };
    }

    case 'check': {
      const checkEvents = await state.readEvents({
        sprint: sprintId,
        stage: 'check',
        type: 'check',
      });
      if (checkEvents.length === 0) {
        return {
          passes: false,
          reason: 'check gate requires at least one check result event',
        };
      }
      for (const ev of checkEvents) {
        if (ev.note) {
          try {
            const result = JSON.parse(ev.note) as { passed?: boolean };
            if (result.passed === false) {
              return {
                passes: false,
                reason: `check '${ev.ref ?? 'unknown'}' did not pass`,
              };
            }
          } catch {
            // note is not JSON — treat as non-failing
          }
        }
      }
      return { passes: true };
    }

    case 'ship': {
      const signOff = await state.getSignOff(sprintId, 'ship');
      if (!signOff || !signOff.actor.startsWith('human:')) {
        return {
          passes: false,
          reason: 'ship gate requires a human sign-off (actor must start with human:)',
        };
      }
      return { passes: true };
    }

    case 'watch': {
      const events = await state.readEvents({
        sprint: sprintId,
        stage: 'watch',
        type: 'artifact',
      });
      if (events.length === 0) {
        return {
          passes: false,
          reason: 'watch gate requires a canary ok artifact event',
        };
      }
      return { passes: true };
    }

    case 'retro': {
      // retro always passes — auto advance
      return { passes: true };
    }

    default: {
      return { passes: false, reason: `unknown stage: ${stage as string}` };
    }
  }
}
