import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import './PublicComplaint.css';
import '../auth/AuthPage.css';
import bgImage from '../../assets/college-bg.jpg';
import { trackComplaint } from '../../services/complaintService';
import { ROLES, COMPLAINT_STATUS } from '../../constants/roles';
import { ROUTES } from '../../constants/routes';
import { getApiErrorMessage } from '../../types/api';
import type { ComplaintLevel, ComplaintStatus, TrackedComplaint } from '../../types/domain';

const LEVEL_LABELS: Record<ComplaintLevel, string> = {
  [ROLES.LAB_INCHARGE]: 'Lab Incharge',
  [ROLES.HOD]: 'HOD',
};

const STATUS_LABELS: Record<ComplaintStatus, string> = {
  [COMPLAINT_STATUS.SUBMITTED]: 'Submitted',
  [COMPLAINT_STATUS.ASSIGNED]: 'Assigned',
  [COMPLAINT_STATUS.IN_PROGRESS]: 'In Progress',
  [COMPLAINT_STATUS.RESOLVED]: 'Resolved',
  [COMPLAINT_STATUS.CLOSED]: 'Closed',
};

function TrackComplaintPage() {
  const [token, setToken] = useState('');
  const [complaint, setComplaint] = useState<TrackedComplaint | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setComplaint(null);
    setSubmitting(true);
    try {
      const res = await trackComplaint(token.trim());
      setComplaint(res.data?.data || null);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Invalid tracking token.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="public-page" style={{ backgroundImage: `url(${bgImage})` }}>
      <div className="public-overlay" />

      <div className="public-card">
        <div className="public-header auth-header">
          <div className="accent-line" />
          <p className="portal-label">PUBLIC COMPLAINT</p>
          <h1 className="brand-title">Track Complaint</h1>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="field-label" htmlFor="token">
            Tracking Token
          </label>
          <input
            id="token"
            type="text"
            className="field-input"
            placeholder="e.g. aB3xQ9kL"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            required
          />

          {error && <p className="form-message form-message-error">{error}</p>}

          <button type="submit" className="submit-btn" disabled={submitting}>
            {submitting ? 'Checking…' : 'Check Status'}
          </button>
        </form>

        {complaint && (
          <div className="status-panel">
            <div className="status-row">
              <span className="status-label">Status</span>
              <span className="status-value">
                <span className="status-badge">
                  {STATUS_LABELS[complaint.status] || complaint.status}
                </span>
              </span>
            </div>
            <div className="status-row">
              <span className="status-label">Current Level</span>
              <span className="status-value">
                {LEVEL_LABELS[complaint.currentLevel] || complaint.currentLevel}
              </span>
            </div>
            <div className="status-row">
              <span className="status-label">Description</span>
              <span className="status-value">{complaint.description}</span>
            </div>
            <div className="status-row">
              <span className="status-label">Raised On</span>
              <span className="status-value">{new Date(complaint.createdAt).toLocaleString()}</span>
            </div>
          </div>
        )}

        <div className="public-links">
          <Link to={ROUTES.RAISE_COMPLAINT}>Raise a complaint</Link>|
          <Link to={ROUTES.LOGIN}>Staff login</Link>
        </div>
      </div>
    </div>
  );
}

export default TrackComplaintPage;
