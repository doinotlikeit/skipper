import { useState, useEffect, useCallback } from 'react';
import { api, subscribeEvents } from '../api/client';
import SignoffBanner from '../components/SignoffBanner';
import type { SkipperEvent, SignoffRequest, StageName } from '../types';

export default function Inbox() {
  const [events, setEvents] = useState<SkipperEvent[]>([]);
  const [signoffs, setSignoffs] = useState<SignoffRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Isolated signoff refresh so handlers can call it without re-fetching events.
  const refreshSignoffs = useCallback(async () => {
    const pending = await api.get<SignoffRequest[]>('/api/signoffs/pending');
    setSignoffs(pending);
  }, []);

  // Initial load + WebSocket subscription
  useEffect(() => {
    const init = async () => {
      try {
        const [evts, pending] = await Promise.all([
          api.get<SkipperEvent[]>('/api/events'),
          api.get<SignoffRequest[]>('/api/signoffs/pending'),
        ]);
        // Newest first on initial load
        setEvents([...evts].reverse());
        setSignoffs(pending);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load inbox');
      } finally {
        setLoading(false);
      }
    };

    init();

    // Prepend live events as they arrive
    const unsub = subscribeEvents((event) => {
      setEvents((prev) => [event, ...prev]);
    });

    return unsub;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleApprove = async (id: string) => {
    // Capture signoff data before the state update clears it
    const target = signoffs.find((s) => s.id === id);
    try {
      await api.post(`/api/signoffs/${id}/approve`, {
        actor: 'human:ui',
        note: '',
      });
      await refreshSignoffs();
      if (target) {
        const synthetic: SkipperEvent = {
          ts: new Date().toISOString(),
          actor: 'human:ui',
          sprint: target.sprint,
          stage: target.stage as StageName,
          type: 'signoff',
          ref: id,
          note: 'approved',
        };
        setEvents((prev) => [synthetic, ...prev]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approve failed');
    }
  };

  const handleReject = async (id: string) => {
    const target = signoffs.find((s) => s.id === id);
    try {
      await api.post(`/api/signoffs/${id}/reject`, {
        actor: 'human:ui',
        note: '',
      });
      await refreshSignoffs();
      if (target) {
        const synthetic: SkipperEvent = {
          ts: new Date().toISOString(),
          actor: 'human:ui',
          sprint: target.sprint,
          stage: target.stage as StageName,
          type: 'signoff',
          ref: id,
          note: 'rejected',
        };
        setEvents((prev) => [synthetic, ...prev]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reject failed');
    }
  };

  if (loading) return <div className="loading">Loading inbox…</div>;

  return (
    <div className="view inbox">
      <header className="view-header">
        <h1>Inbox</h1>
      </header>

      {error && <div className="error">{error}</div>}

      <SignoffBanner
        requests={signoffs}
        onApprove={handleApprove}
        onReject={handleReject}
      />

      <section>
        <h2>Event Stream</h2>
        {events.length === 0 ? (
          <p className="empty">No events yet.</p>
        ) : (
          <table className="table events-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Actor</th>
                <th>Sprint / Stage</th>
                <th>Type</th>
                <th>Note / Ref</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e, i) => (
                // ts+i as key: events are prepended so index alone isn't stable
                <tr key={`${e.ts}-${i}`}>
                  <td className="ts">{new Date(e.ts).toLocaleString()}</td>
                  <td>{e.actor}</td>
                  <td>
                    <span className="badge badge-stage">{e.sprint}</span>
                    <span className="badge badge-stage">{e.stage}</span>
                  </td>
                  <td>
                    <span className={`badge badge-event-${e.type}`}>
                      {e.type}
                    </span>
                  </td>
                  <td>{e.note ?? e.ref ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
