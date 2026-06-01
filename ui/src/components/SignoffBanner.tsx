import type { SignoffRequest } from '../types';

interface Props {
  requests: SignoffRequest[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

export default function SignoffBanner({ requests, onApprove, onReject }: Props) {
  if (requests.length === 0) return null;

  return (
    <section className="signoff-banner">
      <h3>Pending Sign-offs ({requests.length})</h3>
      <ul className="signoff-list">
        {requests.map((r) => (
          <li key={r.id} className="signoff-item">
            <div className="signoff-meta">
              <span className="badge badge-stage">{r.stage}</span>
              <span className="signoff-sprint">Sprint: {r.sprint}</span>
              <span className="signoff-reason">{r.reason}</span>
              <span className="signoff-ts">{new Date(r.ts).toLocaleString()}</span>
            </div>
            <div className="signoff-actions">
              <button
                className="btn btn-approve"
                onClick={() => onApprove(r.id)}
                type="button"
              >
                Approve
              </button>
              <button
                className="btn btn-reject"
                onClick={() => onReject(r.id)}
                type="button"
              >
                Reject
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
