import { useState, type FormEvent } from 'react';
import DetailModal from '../../components/common/DetailModal';
import type { Complaint } from '../../types/domain';

interface ResolveComplaintModalProps {
  complaint: Complaint | null;
  onCancel: () => void;
  onSubmit: (id: string, remarks: string) => void;
  submitting: boolean;
  error: string;
}

function ResolveComplaintModal({
  complaint,
  onCancel,
  onSubmit,
  submitting,
  error,
}: ResolveComplaintModalProps) {
  const [remarks, setRemarks] = useState('');

  if (!complaint) return null;

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSubmit(complaint._id, remarks.trim());
  };

  return (
    <DetailModal
      label="RESOLVE COMPLAINT"
      title={complaint.token}
      onClose={onCancel}
      overlayClassName="resolve-overlay"
      cardClassName="resolve-card"
      wrapBody={false}
    >
      <p className="field-label">Complaint</p>
      <p className="detail-value" style={{ marginBottom: 20 }}>
        {complaint.description}
      </p>

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
    </DetailModal>
  );
}

export default ResolveComplaintModal;
