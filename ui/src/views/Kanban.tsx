import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api, subscribeEvents } from '../api/client';
import type { Sprint, StageStatus } from '../types';

// The eight stages in display order
const STAGE_ORDER = [
  'intake',
  'adr',
  'plan',
  'build',
  'check',
  'ship',
  'watch',
  'retro',
] as const;

function statusBadgeClass(status: StageStatus): string {
  switch (status) {
    case 'pending':    return 'badge badge-pending';
    case 'in_progress': return 'badge badge-in-progress';
    case 'done':       return 'badge badge-done';
    case 'signed_off': return 'badge badge-signed-off';
    case 'escalated':  return 'badge badge-escalated';
    case 'failed':     return 'badge badge-failed';
  }
}

export default function Kanban() {
  const { id } = useParams<{ id: string }>();
  const [sprint, setSprint] = useState<Sprint | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSprint = async () => {
    if (!id) return;
    try {
      const s = await api.get<Sprint>(`/api/sprints/${id}`);
      setSprint(s);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sprint');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSprint();
    const unsub = subscribeEvents(() => void fetchSprint());
    return unsub;
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="loading">Loading sprint…</div>;
  if (error)   return <div className="error">{error}</div>;
  if (!sprint) return <div className="error">Sprint not found.</div>;

  // Build a fast lookup: stageName → Stage
  const stageMap = Object.fromEntries(sprint.stages.map((s) => [s.name, s]));

  return (
    <div className="view kanban">
      <header className="view-header">
        <h1>Sprint: {sprint.id}</h1>
        <p className="sprint-goal">{sprint.goal}</p>
        {sprint.roadmap_ref && (
          <p className="sprint-meta">
            Roadmap ref: <code>{sprint.roadmap_ref}</code>
          </p>
        )}
      </header>

      <div className="kanban-board">
        {STAGE_ORDER.map((stageName) => {
          const stage = stageMap[stageName];
          return (
            <div key={stageName} className="kanban-column">
              <div className="kanban-column-header">
                <span className="stage-name">{stageName}</span>
              </div>
              {stage ? (
                <div className="kanban-card">
                  <span className={statusBadgeClass(stage.status)}>
                    {stage.status}
                  </span>
                  <div className="card-owner">
                    {stage.owner}
                  </div>
                  {stage.task_ref && (
                    <div className="card-task-ref">
                      <code>{stage.task_ref}</code>
                    </div>
                  )}
                </div>
              ) : (
                <div className="kanban-card kanban-card-empty">
                  <span className="badge badge-pending">pending</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
