import { useState } from 'react';
import DetailModal from '../../components/common/DetailModal';
import { WARRANTY_STATUS_META, formatDateTime } from './pcSearchMeta';
import { formatDate } from '../../utils/formatDate';
import { getPcHealthCard } from '../../services/pcService';
import { getApiErrorMessage } from '../../types/api';
import type { Pc } from '../../types/domain';

interface PcHealthCardModalProps {
  pc: Pc | null;
  onClose: () => void;
  onRefresh?: (pc: Pc | undefined) => void;
}

function PcHealthCardModal({ pc, onClose, onRefresh }: PcHealthCardModalProps) {
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState('');

  if (!pc) return null;

  const meta = WARRANTY_STATUS_META[pc.warranty?.status] || {
    label: pc.warranty?.status,
    modifier: 'open',
  };

  const handleRefresh = () => {
    setRefreshing(true);
    setRefreshError('');
    getPcHealthCard(pc._id)
      .then((res) => onRefresh?.(res.data?.data))
      .catch((err: unknown) => setRefreshError(getApiErrorMessage(err, 'Failed to refresh.')))
      .finally(() => setRefreshing(false));
  };

  return (
    <DetailModal
      label="PC HEALTH CARD"
      title={pc.deadStockNo}
      onClose={onClose}
      headerExtra={
        <button
          type="button"
          className="pc-search-reset"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      }
    >
      {refreshError && <p className="panel-state-text panel-state-text--error">{refreshError}</p>}
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
    </DetailModal>
  );
}

export default PcHealthCardModal;
