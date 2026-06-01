import { Command } from 'commander';
import { getCore } from '../client.js';

export function registerInbox(program: Command): void {
  program
    .command('inbox')
    .description('Stream events from the event log')
    .option('--follow', 'Follow events via WebSocket (stream until Ctrl-C)')
    .option('--repo <path>', 'Path to the repository (default: cwd)')
    .option('--json', 'Output as JSON')
    .action(async (opts: { follow?: boolean; repo?: string; json?: boolean }) => {
      try {
        if (opts.follow) {
          await followEvents(opts.json);
        } else {
          const core = await getCore(opts.repo);
          const events = await core.getEvents();

          if (opts.json) {
            console.log(JSON.stringify(events, null, 2));
            process.exit(0);
          }

          if (events.length === 0) {
            console.log('No events.');
            return;
          }

          for (const ev of events) {
            console.log(
              `${ev.ts}  [${ev.sprint}/${ev.stage}]  ${ev.type}  actor=${ev.actor}${ev.note ? `  ${ev.note}` : ''}`
            );
          }
        }
      } catch (err: unknown) {
        console.error((err as Error).message);
        process.exit(1);
      }
    });
}

async function followEvents(jsonMode?: boolean): Promise<void> {
  const wsUrl = 'ws://localhost:3000/ws';

  let ws: WebSocket;
  try {
    ws = new WebSocket(wsUrl);
  } catch {
    console.error('Could not connect to WebSocket at ' + wsUrl);
    process.exit(1);
  }

  ws.addEventListener('open', () => {
    if (!jsonMode) {
      console.log(`Connected to ${wsUrl} — streaming events (Ctrl-C to stop)...`);
    }
  });

  ws.addEventListener('message', (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data as string);
      if (jsonMode) {
        console.log(JSON.stringify(data));
      } else {
        const ev = data as { ts?: string; sprint?: string; stage?: string; type?: string; actor?: string; note?: string };
        console.log(
          `${ev.ts ?? ''}  [${ev.sprint ?? ''}/${ev.stage ?? ''}]  ${ev.type ?? ''}  actor=${ev.actor ?? ''}${ev.note ? `  ${ev.note}` : ''}`
        );
      }
    } catch {
      console.log(event.data);
    }
  });

  ws.addEventListener('error', () => {
    console.error('WebSocket error — could not connect or connection dropped.');
    process.exit(1);
  });

  ws.addEventListener('close', () => {
    if (!jsonMode) {
      console.log('WebSocket connection closed.');
    }
    process.exit(0);
  });

  // Keep the process alive until Ctrl-C
  process.on('SIGINT', () => {
    ws.close();
    process.exit(0);
  });

  // Prevent the event loop from exiting
  await new Promise<void>(() => {
    // Intentionally never resolves — process exits on Ctrl-C or WS close
  });
}
