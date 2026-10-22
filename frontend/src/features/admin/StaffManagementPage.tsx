import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import './StaffManagementPage.css';
import { listHods, createHod, toggleHodActive, deleteHod } from '../../services/adminService';
import { listDepartments } from '../../services/deptService';
import { logout } from '../../services/authService';
import { useAuth } from '../../hooks/useAuth';
import { ROUTES } from '../../constants/routes';
import { getApiErrorMessage } from '../../types/api';
import type { AuthUser, Department } from '../../types/domain';
import { DEFAULT_DEPARTMENTS } from '../../constants/departments';

interface StaffManagementPageProps {
  onSwitchToComplaints?: () => void;
}

export const StaffManagementPage: React.FC<StaffManagementPageProps> = ({
  onSwitchToComplaints,
}) => {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();

  const [hods, setHods] = useState<AuthUser[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  );

  const availableDepartments = useMemo(() => {
    if (departments.length > 0) return departments;
    return DEFAULT_DEPARTMENTS.map((d) => ({
      _id: d.name,
      name: d.name,
      code: d.code,
    }));
  }, [departments]);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formDept, setFormDept] = useState('');
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState('');

  // Row action loading map: { [userId]: boolean }
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  const fetchData = async () => {
    try {
      setLoading(true);
      const [hodRes, deptRes] = await Promise.all([listHods(), listDepartments()]);
      setHods(hodRes.data.data || []);
      setDepartments(deptRes.data.data || []);
    } catch (err: unknown) {
      setBanner({
        type: 'error',
        message: getApiErrorMessage(err, 'Failed to load staff list or departments.'),
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
      // clear local state regardless
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
    setFormDept(availableDepartments[0]?._id || '');
    setModalError('');
    setIsModalOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formEmail.trim() || !formPassword.trim() || !formDept) {
      setModalError('Please fill in all required fields.');
      return;
    }

    try {
      setModalLoading(true);
      setModalError('');
      const res = await createHod({
        name: formName.trim(),
        email: formEmail.trim(),
        password: formPassword,
        department: formDept,
      });

      setHods((prev) => [res.data.data, ...prev]);
      setIsModalOpen(false);
      setBanner({
        type: 'success',
        message: `HOD account for ${res.data.data.name} created! Login credentials emailed to ${res.data.data.email}.`,
      });
    } catch (err: unknown) {
      setModalError(getApiErrorMessage(err, 'Failed to create HOD account.'));
    } finally {
      setModalLoading(false);
    }
  };

  const handleToggleActive = async (targetUser: AuthUser) => {
    const nextStatus = !targetUser.isActive;
    const confirmMsg = nextStatus
      ? `Re-activate HOD account for ${targetUser.name}? They will be able to log in again.`
      : `Deactivate HOD account for ${targetUser.name}? Their active sessions will be terminated immediately.`;

    if (!window.confirm(confirmMsg)) return;

    try {
      setActionLoading((prev) => ({ ...prev, [targetUser._id]: true }));
      const res = await toggleHodActive(targetUser._id, nextStatus);
      const updated = res.data.data;
      setHods((prev) => prev.map((h) => (h._id === updated._id ? updated : h)));
      setBanner({
        type: 'success',
        message: `HOD ${updated.name} has been ${nextStatus ? 'activated' : 'deactivated'}.`,
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

  const handleDeleteHod = async (targetUser: AuthUser) => {
    const confirmMsg = `Are you sure you want to permanently delete HOD "${targetUser.name}"? This will remove their account and data from the database and system.`;
    if (!window.confirm(confirmMsg)) return;

    try {
      setActionLoading((prev) => ({ ...prev, [targetUser._id]: true }));
      await deleteHod(targetUser._id);
      setHods((prev) => prev.filter((h) => h._id !== targetUser._id));
      setBanner({
        type: 'success',
        message: `HOD ${targetUser.name} has been permanently deleted from the system.`,
      });
    } catch (err: unknown) {
      setBanner({
        type: 'error',
        message: getApiErrorMessage(err, 'Failed to delete HOD account.'),
      });
    } finally {
      setActionLoading((prev) => ({ ...prev, [targetUser._id]: false }));
    }
  };

  const filteredHods = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return hods;
    return hods.filter(
      (h) =>
        h.name.toLowerCase().includes(q) ||
        h.email.toLowerCase().includes(q) ||
        (h.department?.name && h.department.name.toLowerCase().includes(q)),
    );
  }, [hods, search]);

  const stats = useMemo(() => {
    const total = hods.length;
    const active = hods.filter((h) => h.isActive).length;
    const inactive = total - active;
    const deptsCount = new Set(hods.map((h) => h.department?._id).filter(Boolean)).size;
    return { total, active, inactive, deptsCount };
  }, [hods]);

  return (
    <div className="staff-page">
      <header className="staff-header">
        <div>
          <h1 className="staff-brand-title">LABMON</h1>
          <p className="staff-brand-subtitle">DEAN INFRA / ADMIN PORTAL</p>
        </div>
        <div className="staff-header-right">
          <span className="staff-user-name">{user?.name || 'Dean Infra'}</span>
          <span className="staff-role-badge">ADMIN</span>
          <button type="button" className="staff-logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      <main className="staff-content">
        <div className="staff-top-nav">
          <div className="staff-tabs">
            <button type="button" className="staff-tab-btn staff-tab-btn--active">
              HOD Management
            </button>
            {onSwitchToComplaints && (
              <button
                type="button"
                className="staff-tab-btn"
                onClick={onSwitchToComplaints}
              >
                Complaints Dashboard
              </button>
            )}
          </div>
          <button
            type="button"
            className="staff-create-btn"
            onClick={handleOpenModal}
          >
            + Create New HOD
          </button>
        </div>

        {banner && (
          <div className={`staff-alert-banner staff-alert-banner--${banner.type}`}>
            {banner.message}
          </div>
        )}

        {/* Stats Section */}
        <section className="staff-stats-grid">
          <div className="staff-stat-card">
            <p className="staff-stat-label">Total HODs</p>
            <p className="staff-stat-value">{stats.total}</p>
          </div>
          <div className="staff-stat-card">
            <p className="staff-stat-label">Active HODs</p>
            <p className="staff-stat-value" style={{ color: '#16a34a' }}>
              {stats.active}
            </p>
          </div>
          <div className="staff-stat-card">
            <p className="staff-stat-label">Deactivated</p>
            <p className="staff-stat-value" style={{ color: '#dc2626' }}>
              {stats.inactive}
            </p>
          </div>
          <div className="staff-stat-card">
            <p className="staff-stat-label">Departments Covered</p>
            <p className="staff-stat-value" style={{ color: '#2563eb' }}>
              {stats.deptsCount}
            </p>
          </div>
        </section>

        {/* Search & Filter Toolbar */}
        <div className="staff-table-toolbar">
          <input
            type="text"
            className="staff-search-input"
            placeholder="Search by name, email, department..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Staff Table */}
        <div className="staff-table-container">
          <table className="staff-table">
            <thead>
              <tr>
                <th>HOD Name</th>
                <th>Email</th>
                <th>Department</th>
                <th>Status</th>
                <th>Created</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '32px' }}>
                    Loading HOD accounts...
                  </td>
                </tr>
              ) : filteredHods.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: '#64748b' }}>
                    {search ? 'No HODs match your search.' : 'No HOD accounts created yet.'}
                  </td>
                </tr>
              ) : (
                filteredHods.map((hod) => (
                  <tr key={hod._id}>
                    <td>
                      <strong>{hod.name}</strong>
                    </td>
                    <td>{hod.email}</td>
                    <td>
                      <span className="staff-dept-tag">
                        {hod.department?.name || 'Unassigned'}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`staff-status-pill staff-status-pill--${
                          hod.isActive ? 'active' : 'inactive'
                        }`}
                      >
                        {hod.isActive ? 'Active' : 'Deactivated'}
                      </span>
                    </td>
                    <td style={{ color: '#64748b', fontSize: '13px' }}>
                      {new Date(hod.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="staff-actions-cell">
                        <button
                          type="button"
                          disabled={actionLoading[hod._id]}
                          className={`staff-action-btn staff-action-btn--${
                            hod.isActive ? 'deactivate' : 'activate'
                          }`}
                          onClick={() => handleToggleActive(hod)}
                        >
                          {actionLoading[hod._id]
                            ? 'Updating...'
                            : hod.isActive
                              ? 'Deactivate'
                              : 'Activate'}
                        </button>
                        <button
                          type="button"
                          disabled={actionLoading[hod._id]}
                          className="staff-action-btn staff-action-btn--delete"
                          onClick={() => handleDeleteHod(hod)}
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

      {/* Create HOD Modal */}
      {isModalOpen && (
        <div className="staff-modal-backdrop" onClick={() => setIsModalOpen(false)}>
          <div className="staff-modal" onClick={(e) => e.stopPropagation()}>
            <div className="staff-modal-header">
              <h3 className="staff-modal-title">Create Head of Department (HOD)</h3>
              <button
                type="button"
                className="staff-modal-close"
                onClick={() => setIsModalOpen(false)}
              >
                &times;
              </button>
            </div>

            {modalError && (
              <div className="staff-alert-banner staff-alert-banner--error">
                {modalError}
              </div>
            )}

            <form onSubmit={handleCreateSubmit}>
              <div className="staff-form-group">
                <label className="staff-form-label">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dr. Jane Smith"
                  className="staff-form-input"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>

              <div className="staff-form-group">
                <label className="staff-form-label">Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="e.g. hod.it@college.edu"
                  className="staff-form-input"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                />
              </div>

              <div className="staff-form-group">
                <label className="staff-form-label">Department</label>
                <select
                  required
                  className="staff-form-select"
                  value={formDept}
                  onChange={(e) => setFormDept(e.target.value)}
                >
                  <option value="" disabled>
                    Select Department
                  </option>
                  {availableDepartments.map((d) => (
                    <option key={d._id} value={d._id}>
                      {d.name} ({d.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="staff-form-group">
                <label className="staff-form-label">Password</label>
                <div className="staff-password-wrapper">
                  <input
                    type="text"
                    required
                    placeholder="Enter or generate password (min 8 chars)"
                    className="staff-form-input"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="staff-gen-pw-btn"
                    onClick={handleGeneratePassword}
                  >
                    Generate
                  </button>
                </div>
              </div>

              <div className="staff-info-box">
                📧 <strong>Instant Delivery & Activation:</strong> Credentials will be emailed
                directly to the specified email address. The account will be pre-verified,
                allowing the HOD to log in immediately.
              </div>

              <div className="staff-modal-actions">
                <button
                  type="button"
                  className="staff-btn-cancel"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalLoading}
                  className="staff-btn-submit"
                >
                  {modalLoading ? 'Creating & Emailing...' : 'Create HOD'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default StaffManagementPage;
