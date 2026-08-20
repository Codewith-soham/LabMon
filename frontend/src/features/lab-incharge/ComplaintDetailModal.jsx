import { STATUS_META } from './complaintData';

function ComplaintDetailModal({ complaint, onClose, onEscalate, onResolve }) {
  if (!complaint) return null;

  const meta = STATUS_META[complaint.status];
  const canEscalate = complaint.status === 'Open';
  const canResolve = complaint.status !== 'Resolved';

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="detail-overlay" onClick={handleOverlayClick}>
      <div className="detail-card">
        <div className="detail-header">
          <div>
            <p className="portal-label">COMPLAINT DETAILS</p>
            <h1 className="brand-title" style={{ fontSize: 22 }}>
              {complaint.id}
            </h1>
          </div>
          <button type="button" className="detail-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        <div className="detail-body">
          <p className="field-label">Description</p>
          <p className="detail-value">{complaint.description}</p>

          <p className="field-label">Status</p>
          <span className={`status-pill status-pill--${meta.modifier}`}>
            <span className="status-dot" />
            {meta.label}
          </span>

          <div className="detail-meta-grid">
            <div>
              <p className="field-label">Raised By</p>
              <p className="detail-value">{complaint.raisedBy}</p>
            </div>
            <div>
              <p className="field-label">Date Raised</p>
              <p className="detail-value">{complaint.date}</p>
            </div>
            <div>
              <p className="field-label">Lab / Location</p>
              <p className="detail-value">{complaint.location}</p>
            </div>
            <div>
              <p className="field-label">Current Level</p>
              <p className="detail-value">{complaint.level}</p>
            </div>
          </div>

          <p className="field-label" style={{ marginTop: 20 }}>
            History
          </p>
          <ul className="detail-history">
            {complaint.history.map((entry, idx) => (
              <li key={idx}>{entry}</li>
            ))}
          </ul>

          {(canEscalate || canResolve) && (
            <div className="detail-actions">
              {canEscalate && (
                <button
                  type="button"
                  className="action-btn action-btn--escalate"
                  onClick={() => onEscalate(complaint.id)}
                >
                  Escalate
                </button>
              )}
              {canResolve && (
                <button
                  type="button"
                  className="action-btn action-btn--resolve"
                  onClick={() => onResolve(complaint.id)}
                >
                  Resolve
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ComplaintDetailModal;
