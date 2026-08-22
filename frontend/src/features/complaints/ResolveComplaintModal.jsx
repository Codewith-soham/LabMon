import { useState } from 'react';

function ResolveComplaintModal({ complaint, onCancel, onSubmit, submitting, error }) {
  const [remarks, setRemarks] = useState('');

  if (!complaint) return null;

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onCancel();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(complaint._id, remarks.trim());
  };

  return (
    <div className="detail-overlay resolve-overlay" onClick={handleOverlayClick}>
      <div className="detail-card resolve-card">
        <div className="detail-header">
          <div>
            <p className="portal-label">RESOLVE COMPLAINT</p>
            <h1 className="brand-title" style={{ fontSize: 22 }}>
              {complaint.token}
            </h1>
          </div>
          <button type="button" className="detail-close" onClick={onCancel} aria-label="Close">
            &times;
          </button>
        </div>

        <p className="field-label">Complaint</p>
        <p className="detail-value" style={{ marginBottom: 20 }}>{complaint.description}</p>

        <form onSubmit={handleSubmit}>
          <label className="field-label" htmlFor="resolve-remarks">
            How was this resolved?
          </label>
          <textarea
            id="resolve-remarks"
            className="field-input field-textarea"
            placeholder="Describe what was done to resolve this complaint…"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            required
          />

          {error && <p className="form-message form-message-error">{error}</p>}

          <div className="detail-actions">
            <button type="button" className="link-btn" onClick={onCancel} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="submit-btn" disabled={submitting} style={{ flex: 1 }}>
              {submitting ? 'Resolving…' : 'Mark Resolved'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ResolveComplaintModal;
