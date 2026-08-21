import { WARRANTY_STATUS_META, formatDateTime } from './pcSearchMeta';
import { formatDate } from '../../utils/formatDate';

function PcHealthCardModal({ pc, onClose }) {
  if (!pc) return null;

  const meta = WARRANTY_STATUS_META[pc.warranty?.status] || { label: pc.warranty?.status, modifier: 'open' };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="detail-overlay" onClick={handleOverlayClick}>
      <div className="detail-card">
        <div className="detail-header">
          <div>
            <p className="portal-label">PC HEALTH CARD</p>
            <h1 className="brand-title" style={{ fontSize: 22 }}>
              {pc.deadStockNo}
            </h1>
          </div>
          <button type="button" className="detail-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        <div className="detail-body">
          <p className="field-label">Warranty Status</p>
          <span className={`status-pill status-pill--${meta.modifier}`}>
            <span className="status-dot" />
            {meta.label}
          </span>

          <div className="detail-meta-grid">
            <div>
              <p className="field-label">Department</p>
              <p className="detail-value">{pc.department?.name || '—'}</p>
            </div>
            <div>
              <p className="field-label">Lab</p>
              <p className="detail-value">{pc.lab?.name || '—'}</p>
            </div>
            <div>
              <p className="field-label">CPU</p>
              <p className="detail-value">{pc.config?.cpu || '—'}</p>
            </div>
            <div>
              <p className="field-label">RAM</p>
              <p className="detail-value">{pc.config?.ram || '—'}</p>
            </div>
            <div>
              <p className="field-label">Disk</p>
              <p className="detail-value">{pc.config?.disk || '—'}</p>
            </div>
            <div>
              <p className="field-label">OS</p>
              <p className="detail-value">{pc.config?.os || '—'}</p>
            </div>
            <div>
              <p className="field-label">Warranty Expiry</p>
              <p className="detail-value">{formatDate(pc.warranty?.expiryDate) || '—'}</p>
            </div>
            <div>
              <p className="field-label">Last Synced</p>
              <p className="detail-value">{formatDateTime(pc.config?.lastSyncedAt)}</p>
            </div>
          </div>

          <p className="field-label" style={{ marginTop: 20 }}>
            Software
          </p>
          <p className="detail-value">
            {pc.config?.software?.length ? pc.config.software.join(', ') : '—'}
          </p>
        </div>
      </div>
    </div>
  );
}

export default PcHealthCardModal;
