import { STATUS_META, LEVEL_LABEL, formatDateTime, describeHistoryEntry } from './complaintMeta';

function ComplaintDetailModal({ complaint, canAct, onClose, onEscalate, onResolveClick }) {
  if (!complaint) return null;

  const meta = STATUS_META[complaint.status];

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
              {complaint.token}
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
              <p className="detail-value">{complaint.raisedBy?.name}</p>
              <p className="detail-value detail-value-sub">{complaint.raisedBy?.contact}</p>
            </div>
            <div>
              <p className="field-label">Date Raised</p>
              <p className="detail-value">{formatDateTime(complaint.createdAt)}</p>
            </div>
            <div>
              <p className="field-label">Lab</p>
              <p className="detail-value">{complaint.lab?.name || complaint.lab}</p>
            </div>
            <div>
              <p className="field-label">Current Level</p>
              <p className="detail-value">{LEVEL_LABEL[complaint.currentLevel] || complaint.currentLevel}</p>
            </div>
          </div>

          <p className="field-label" style={{ marginTop: 20 }}>
            History
          </p>
          <ul className="detail-history">
            {complaint.history.map((entry, idx) => (
              <li key={idx} className="detail-history-entry">
                <div className="detail-history-row">
                  <span className="detail-history-action">{describeHistoryEntry(entry)}</span>
                  <span className="detail-history-time">{formatDateTime(entry.at)}</span>
                </div>
                {entry.note && <p className="detail-history-note">"{entry.note}"</p>}
              </li>
            ))}
          </ul>

          {canAct && (
            <div className="detail-actions">
              <button
                type="button"
                className="action-btn action-btn--escalate"
                onClick={() => onEscalate(complaint._id)}
              >
                Escalate
              </button>
              <button
                type="button"
                className="action-btn action-btn--resolve"
                onClick={() => onResolveClick(complaint)}
              >
                Resolve
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ComplaintDetailModal;
