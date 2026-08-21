import { useState } from 'react';
import { Link } from 'react-router-dom';
import './PublicComplaint.css';
import '../auth/AuthPage.css';
import bgImage from '../../assets/college-bg.jpg';
import { raiseComplaint } from '../../services/complaintService';
import { lookupPc } from '../../services/pcService';
import { ROUTES } from '../../constants/routes';

const INITIAL_FORM = {
  deadStockNo: '',
  description: '',
  name: '',
  contact: '',
};

function RaiseComplaintPage() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [token, setToken] = useState('');
  const [pcInfo, setPcInfo] = useState(null);
  const [pcCheckError, setPcCheckError] = useState('');
  const [checkingPc, setCheckingPc] = useState(false);

  const updateField = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    if (field === 'deadStockNo') {
      setPcInfo(null);
      setPcCheckError('');
    }
  };

  const handleDeadStockBlur = async () => {
    const value = form.deadStockNo.trim();
    if (!value) return;
    setCheckingPc(true);
    try {
      const res = await lookupPc(value);
      setPcInfo(res.data?.data || null);
    } catch (err) {
      setPcCheckError(err.response?.data?.message || 'PC not found.');
    } finally {
      setCheckingPc(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await raiseComplaint({
        deadStockNo: form.deadStockNo.trim(),
        description: form.description.trim(),
        raisedBy: { name: form.name.trim(), contact: form.contact.trim() },
      });
      setToken(res.data?.data?.token || '');
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setForm(INITIAL_FORM);
    setToken('');
    setError('');
    setPcInfo(null);
    setPcCheckError('');
  };

  return (
    <div className="public-page" style={{ backgroundImage: `url(${bgImage})` }}>
      <div className="public-overlay" />

      <Link to={ROUTES.LOGIN} className="moderator-btn">
        Moderator
      </Link>

      <div className="public-card">
        <div className="public-header auth-header">
          <div className="accent-line" />
          <p className="portal-label">PUBLIC COMPLAINT</p>
          <h1 className="brand-title">Raise a Complaint</h1>
        </div>

        {token ? (
          <>
            <div className="token-display">
              <p className="field-label" style={{ marginBottom: 4 }}>
                Your tracking token
              </p>
              <p className="token-value">{token}</p>
            </div>
            <p className="form-message" style={{ color: '#4b5563' }}>
              Save this token — you&apos;ll need it to check your complaint&apos;s status.
            </p>
            <button type="button" className="submit-btn" onClick={handleReset}>
              Raise Another Complaint
            </button>
            <div className="public-links">
              <Link to={ROUTES.TRACK_COMPLAINT}>Track this complaint</Link>|
              <Link to={ROUTES.LOGIN}>Staff login</Link>
            </div>
          </>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="field-label" htmlFor="deadStockNo">
              PC Dead Stock No.
            </label>
            <input
              id="deadStockNo"
              type="text"
              className="field-input"
              placeholder="e.g. DS-1023"
              value={form.deadStockNo}
              onChange={updateField('deadStockNo')}
              onBlur={handleDeadStockBlur}
              required
            />

            {checkingPc && <p className="form-message">Checking PC…</p>}
            {pcInfo && (
              <div className="pc-confirm-box">
                ✓ PC found — Department: <strong>{pcInfo.department?.name || 'Unknown'}</strong> · Lab:{' '}
                <strong>{pcInfo.lab?.name || 'Unknown'}</strong>
              </div>
            )}
            {pcCheckError && <p className="form-message form-message-error">{pcCheckError}</p>}

            <label className="field-label" htmlFor="description">
              Issue Description
            </label>
            <textarea
              id="description"
              className="field-input"
              placeholder="Describe the issue with this PC"
              value={form.description}
              onChange={updateField('description')}
              rows={4}
              required
              style={{ resize: 'vertical' }}
            />

            <label className="field-label" htmlFor="name">
              Your Name
            </label>
            <input
              id="name"
              type="text"
              className="field-input"
              placeholder="Jane Doe"
              value={form.name}
              onChange={updateField('name')}
              required
            />

            <label className="field-label" htmlFor="contact">
              Contact (phone or email)
            </label>
            <input
              id="contact"
              type="text"
              className="field-input"
              placeholder="you@college.edu"
              value={form.contact}
              onChange={updateField('contact')}
              required
            />

            {error && <p className="form-message form-message-error">{error}</p>}

            <button type="submit" className="submit-btn" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit Complaint'}
            </button>

            <div className="public-links">
              <Link to={ROUTES.TRACK_COMPLAINT}>Track a complaint</Link>|
              <Link to={ROUTES.LOGIN}>Staff login</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default RaiseComplaintPage;
