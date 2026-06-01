import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, subscribeEvents } from '../api/client';
import type { Sprint, SignoffRequest } from '../types';

interface ProjectStatus {
  repoPath: string;
  sprints: number;
  activeSprint: Sprint | null;
}

/** Returns the percentage of stages that are done or signed_off. */
function sprintProgress(sprint: Sprint): number {
  if (!sprint.stages || sprint.stages.length === 0) return 0;
  const done = sprint.stages.filter(
    (s) => s.status === 'done' || s.status === 'signed_off',
  ).length;
  return Math.round((done / sprint.stages.length) * 100);
}

export default function Dashboard() {
  const [status, setStatus] = useState<ProjectStatus | null>(null);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = async () => {
    try {
      const [projectStatus, allSprints, pending] = await Promise.all([
        api.get<ProjectStatus>('/api/project/status'),
        api.get<Sprint[]>('/api/sprints'),
        api.get<SignoffRequest[]>('/api/signoffs/pending'),
      ]);
      setStatus(projectStatus);
      setSprints(allSprints);
      setPendingCount(pending.length);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    // Re-fetch whenever a new event arrives so the board stays current.
    const unsub = subscribeEvents(() => void fetchAll());
    return unsub;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="loading">Loading…</div>;
  if (error)   return <div className="error">{error}</div>;

  return (
    <div className="view dashboard">
      <header className="view-header">
        <h1>Dashboard</h1>
        {status && (
          <p className="repo-path">
            Repo: <code>{status.repoPath}</code>
          </p>
        )}
      </header>

      {/* Summary stat cards */}
      <div className="stats-row">
        <div className="stat-card">
          <span className="stat-value">{sprints.length}</span>
          <span className="stat-label">Total Sprints</span>
        </div>

        <div className="stat-card">
          <Link to="/inbox" className="stat-link">
            <span className="stat-value">{pendingCount}</span>
            <span className="stat-label">Pending Sign-offs</span>
          </Link>
        </div>

        {status?.activeSprint && (
          <div className="stat-card">
            <span className="stat-value">{status.activeSprint.id}</span>
            <span className="stat-label">Active Sprint</span>
          </div>
        )}
      </div>

      {/* Sprint list */}
      <section>
        <h2>Sprints</h2>
        {sprints.length === 0 ? (
          <p className="empty">No sprints yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Goal</th>
                <th>Roadmap Ref</th>
                <th>Progress</th>
              </tr>
            </thead>
            <tbody>
              {sprints.map((s) => {
                const pct = sprintProgress(s);
                return (
                  <tr key={s.id}>
                    <td>
                      <Link to={`/sprints/${s.id}`} className="link">
                        {s.id}
                      </Link>
                    </td>
                    <td>{s.goal}</td>
                    <td>{s.roadmap_ref ?? '—'}</td>
                    <td>
                      <div className="progress-bar" title={`${pct}%`}>
                        <div
                          className="progress-fill"
                          style={{ width: `${pct}%` }}
                        />
                        <span className="progress-label">{pct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
