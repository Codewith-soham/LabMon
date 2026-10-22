import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import './LabInchargeManagementPage.css';
import {
  listLabIncharges,
  createLabIncharge,
  toggleLabInchargeActive,
  deleteLabIncharge,
} from '../../services/hodService';
import { logout } from '../../services/authService';
import { useAuth } from '../../hooks/useAuth';
import { ROUTES } from '../../constants/routes';
import { getApiErrorMessage } from '../../types/api';
import type { AuthUser } from '../../types/domain';

interface LabInchargeManagementPageProps {
  onSwitchToComplaints?: () => void;
}

export const LabInchargeManagementPage: React.FC<LabInchargeManagementPageProps> = ({
  onSwitchToComplaints,
}) => {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();

  const [incharges, setIncharges] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  );

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState('');

  // Row action loading map: { [userId]: boolean }
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  const deptName = user?.department?.name || 'Department';

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await listLabIncharges();
      setIncharges(res.data.data || []);
    } catch (err: unknown) {
      setBanner({
        type: 'error',
        message: getApiErrorMessage(err, 'Failed to load Lab Incharges.'),
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // clear session regardless
    } finally {
      localStorage.removeItem('accessToken');
      setUser(null);
      navigate(ROUTES.LOGIN, { replace: true });
    }
  };

  const handleGeneratePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
    let pw = '';
    for (let i = 0; i < 10; i++) {
      pw += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormPassword(pw);
  };

  const handleOpenModal = () => {
    setFormName('');
    setFormEmail('');
    setFormPassword('');
    setModalError('');
    setIsModalOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formEmail.trim() || !formPassword.trim()) {
      setModalError('Please fill in all required fields.');
      return;
    }

    try {
      setModalLoading(true);
      setModalError('');
      const res = await createLabIncharge({
        name: formName.trim(),
        email: formEmail.trim(),
        password: formPassword,
      });

      setIncharges((prev) => [res.data.data, ...prev]);
      setIsModalOpen(false);
      setBanner({
        type: 'success',
        message: `Lab Incharge account for ${res.data.data.name} created! Login credentials emailed to ${res.data.data.email}.`,
      });
    } catch (err: unknown) {
      setModalError(getApiErrorMessage(err, 'Failed to create Lab Incharge account.'));
    } finally {
      setModalLoading(false);
    }
  };

  const handleToggleActive = async (targetUser: AuthUser) => {
    const nextStatus = !targetUser.isActive;
    const confirmMsg = nextStatus
      ? `Re-activate Lab Incharge account for ${targetUser.name}? They will be able to log in again.`
      : `Deactivate Lab Incharge account for ${targetUser.name}? Their active sessions will be terminated immediately.`;

    if (!window.confirm(confirmMsg)) return;

    try {
      setActionLoading((prev) => ({ ...prev, [targetUser._id]: true }));
      const res = await toggleLabInchargeActive(targetUser._id, nextStatus);
      const updated = res.data.data;
      setIncharges((prev) => prev.map((inc) => (inc._id === updated._id ? updated : inc)));
      setBanner({
        type: 'success',
        message: `Lab Incharge ${updated.name} has been ${nextStatus ? 'activated' : 'deactivated'}.`,
      });
    } catch (err: unknown) {
      setBanner({
        type: 'error',
        message: getApiErrorMessage(err, 'Failed to update account status.'),
      });
    } finally {
      setActionLoading((prev) => ({ ...prev, [targetUser._id]: false }));
    }
  };

  const handleDeleteLabIncharge = async (targetUser: AuthUser) => {
    const confirmMsg = `Are you sure you want to permanently delete Lab Incharge "${targetUser.name}"? This will remove their account and data from the database and system.`;
    if (!window.confirm(confirmMsg)) return;

    try {
      setActionLoading((prev) => ({ ...prev, [targetUser._id]: true }));
      await deleteLabIncharge(targetUser._id);
      setIncharges((prev) => prev.filter((inc) => inc._id !== targetUser._id));
      setBanner({
        type: 'success',
        message: `Lab Incharge ${targetUser.name} has been permanently deleted from the system.`,
      });
    } catch (err: unknown) {
      setBanner({
        type: 'error',
        message: getApiErrorMessage(err, 'Failed to delete Lab Incharge account.'),
      });
    } finally {
      setActionLoading((prev) => ({ ...prev, [targetUser._id]: false }));
    }
  };

  const filteredIncharges = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return incharges;
    return incharges.filter(
      (inc) => inc.name.toLowerCase().includes(q) || inc.email.toLowerCase().includes(q),
    );
  }, [incharges, search]);

  const stats = useMemo(() => {
    const total = incharges.length;
    const active = incharges.filter((inc) => inc.isActive).length;
    const inactive = total - active;
    return { total, active, inactive };
  }, [incharges]);

  return (
    <div className="incharge-page">
      <header className="incharge-header">
        <div>
          <h1 className="incharge-brand-title">LABMON</h1>
          <p className="incharge-brand-subtitle">HOD PORTAL · {deptName.toUpperCase()}</p>
        </div>
        <div className="incharge-header-right">
          <span className="incharge-user-name">{user?.name || 'HOD'}</span>
          <span className="incharge-dept-badge">{deptName}</span>
          <button type="button" className="incharge-logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      <main className="incharge-content">
        <div className="incharge-top-nav">
          <div className="incharge-tabs">
            <button type="button" className="incharge-tab-btn incharge-tab-btn--active">
              Lab Incharge Management
            </button>
            {onSwitchToComplaints && (
              <button
                type="button"
                className="incharge-tab-btn"
                onClick={onSwitchToComplaints}
              >
                Complaints Dashboard
              </button>
            )}
          </div>
          <button
            type="button"
            className="incharge-create-btn"
            onClick={handleOpenModal}
          >
            + Create Lab Incharge
          </button>
        </div>

        {banner && (
          <div className={`incharge-alert-banner incharge-alert-banner--${banner.type}`}>
            {banner.message}
          </div>
        )}

        {/* Stats Section */}
        <section className="incharge-stats-grid">
          <div className="incharge-stat-card">
            <p className="incharge-stat-label">Total Lab Incharges</p>
            <p className="incharge-stat-value">{stats.total}</p>
          </div>
          <div className="incharge-stat-card">
            <p className="incharge-stat-label">Active Staff</p>
            <p className="incharge-stat-value" style={{ color: '#16a34a' }}>
              {stats.active}
            </p>
          </div>
          <div className="incharge-stat-card">
            <p className="incharge-stat-label">Deactivated Staff</p>
            <p className="incharge-stat-value" style={{ color: '#dc2626' }}>
              {stats.inactive}
            </p>
          </div>
        </section>

        {/* Search Toolbar */}
        <div className="incharge-table-toolbar">
          <input
            type="text"
            className="incharge-search-input"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Staff Table */}
        <div className="incharge-table-container">
          <table className="incharge-table">
            <thead>
              <tr>
                <th>Lab Incharge Name</th>
                <th>Email</th>
                <th>Status</th>
                <th>Created</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '32px' }}>
                    Loading Lab Incharge accounts...
                  </td>
                </tr>
              ) : filteredIncharges.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '32px', color: '#64748b' }}>
                    {search
                      ? 'No Lab Incharges match your search.'
                      : 'No Lab Incharge accounts created yet for this department.'}
                  </td>
                </tr>
              ) : (
                filteredIncharges.map((inc) => (
                  <tr key={inc._id}>
                    <td>
                      <strong>{inc.name}</strong>
                    </td>
                    <td>{inc.email}</td>
                    <td>
                      <span
                        className={`incharge-status-pill incharge-status-pill--${
                          inc.isActive ? 'active' : 'inactive'
                        }`}
                      >
                        {inc.isActive ? 'Active' : 'Deactivated'}
                      </span>
                    </td>
                    <td style={{ color: '#64748b', fontSize: '13px' }}>
                      {new Date(inc.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="incharge-actions-cell">
                        <button
                          type="button"
                          disabled={actionLoading[inc._id]}
                          className={`incharge-action-btn incharge-action-btn--${
                            inc.isActive ? 'deactivate' : 'activate'
                          }`}
                          onClick={() => handleToggleActive(inc)}
                        >
                          {actionLoading[inc._id]
                            ? 'Updating...'
                            : inc.isActive
                              ? 'Deactivate'
                              : 'Activate'}
                        </button>
                        <button
                          type="button"
                          disabled={actionLoading[inc._id]}
                          className="incharge-action-btn incharge-action-btn--delete"
                          onClick={() => handleDeleteLabIncharge(inc)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>

      {/* Create Lab Incharge Modal */}
      {isModalOpen && (
        <div className="incharge-modal-backdrop" onClick={() => setIsModalOpen(false)}>
          <div className="incharge-modal" onClick={(e) => e.stopPropagation()}>
            <div className="incharge-modal-header">
              <h3 className="incharge-modal-title">Create Lab Incharge</h3>
              <button
                type="button"
                className="incharge-modal-close"
                onClick={() => setIsModalOpen(false)}
              >
                &times;
              </button>
            </div>

            {modalError && (
              <div className="incharge-alert-banner incharge-alert-banner--error">
                {modalError}
              </div>
            )}

            <form onSubmit={handleCreateSubmit}>
              <div className="incharge-form-group">
                <label className="incharge-form-label">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. John Doe"
                  className="incharge-form-input"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>

              <div className="incharge-form-group">
                <label className="incharge-form-label">Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="e.g. john.doe@college.edu"
                  className="incharge-form-input"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                />
              </div>

              <div className="incharge-form-group">
                <label className="incharge-form-label">Department</label>
                <input
                  type="text"
                  readOnly
                  className="incharge-form-input"
                  value={deptName}
                />
              </div>

              <div className="incharge-form-group">
                <label className="incharge-form-label">Password</label>
                <div className="incharge-password-wrapper">
                  <input
                    type="text"
                    required
                    placeholder="Enter or generate password (min 8 chars)"
                    className="incharge-form-input"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="incharge-gen-pw-btn"
                    onClick={handleGeneratePassword}
                  >
                    Generate
                  </button>
                </div>
              </div>

              <div className="incharge-info-box">
                📧 <strong>Instant Delivery & Activation:</strong> Credentials will be emailed
                directly to the Lab Incharge. The account is pre-verified and ready for instant
                login.
              </div>

              <div className="incharge-modal-actions">
                <button
                  type="button"
                  className="incharge-btn-cancel"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalLoading}
                  className="incharge-btn-submit"
                >
                  {modalLoading ? 'Creating & Emailing...' : 'Create Lab Incharge'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default LabInchargeManagementPage;
