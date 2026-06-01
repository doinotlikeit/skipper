import http from 'http';
import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import express from 'express';
import expressWs from 'express-ws';
import { WebSocket } from 'ws';
import type { AdapterSet } from '../adapters/interfaces.js';
import type { SkipperEvent } from '../types.js';
import { FileState } from '../state/index.js';
import { Core } from '../core.js';
import { createRouter } from './routes.js';

export interface ServerOptions {
  port?: number;
  repoPath: string;
  adapters: AdapterSet;
}

export async function createServer(opts: ServerOptions): Promise<http.Server> {
  // Bootstrap state and core
  const state = new FileState(opts.repoPath);
  await state.init();
  const core = new Core(state, opts.adapters);
  await core.loadConfig();

  // Express + WebSocket setup
  const expressApp = express();
  const server = http.createServer(expressApp);
  const wsInstance = expressWs(expressApp, server);
  const app = wsInstance.app;

  app.use(express.json());

  // Serve ui/dist static files if present
  // Compiled path: core/dist/api/server.js → ../../../ui/dist = ui/dist (monorepo root)
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const uiDist = path.resolve(__dirname, '../../../ui/dist');
  try {
    await fs.access(uiDist);
    app.use(express.static(uiDist));
  } catch {
    // UI not yet built — skip static serving
  }

  // REST routes
  app.use('/', createRouter(core));

  // WebSocket endpoint — broadcast all core events to connected clients
  const clients = new Set<WebSocket>();

  app.ws('/ws', (ws: WebSocket) => {
    clients.add(ws);
    ws.on('close', () => { clients.delete(ws); });
    ws.on('error', () => { clients.delete(ws); });
  });

  core.eventEmitter.on('event', (event: SkipperEvent) => {
    const payload = JSON.stringify(event);
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  });

  return server;
}

export async function startServer(opts: ServerOptions): Promise<http.Server> {
  const port = opts.port ?? 3000;
  const server = await createServer(opts);
  await new Promise<void>(resolve => server.listen(port, resolve));
  console.log(`Skipper listening on :${port}`);
  return server;
}
