import type { SkipperEvent } from '../types';

// Relative base — all requests are proxied by Vite dev server to localhost:3000
const BASE = '';

export const api = {
  async get<T>(path: string): Promise<T> {
    const res = await fetch(`${BASE}${path}`);
    if (!res.ok) {
      throw new Error(`GET ${path} failed: ${res.status} ${res.statusText}`);
    }
    return res.json() as Promise<T>;
  },

  async post<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      throw new Error(`POST ${path} failed: ${res.status} ${res.statusText}`);
    }
    return res.json() as Promise<T>;
  },
};

/**
 * Opens a WebSocket to /ws (proxied by Vite to ws://localhost:3000/ws),
 * parses each message as a SkipperEvent JSON string, and calls onEvent.
 * Reconnects automatically with a 2 s backoff on unexpected close.
 *
 * Returns a cleanup function that permanently closes the socket and
 * cancels any pending reconnect.
 */
export function subscribeEvents(
  onEvent: (event: SkipperEvent) => void,
): () => void {
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  function connect(): void {
    if (closed) return;

    // Derive ws(s):// from the current page origin so the proxy handles it.
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws`;

    socket = new WebSocket(url);

    socket.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data as string) as SkipperEvent;
        onEvent(data);
      } catch {
        // Ignore malformed frames — the server may send control messages.
      }
    };

    socket.onclose = () => {
      if (!closed) {
        reconnectTimer = setTimeout(connect, 2000);
      }
    };

    socket.onerror = () => {
      // onclose fires right after onerror, so reconnect is handled there.
      socket?.close();
    };
  }

  connect();

  return () => {
    closed = true;
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
    }
    socket?.close();
  };
}
