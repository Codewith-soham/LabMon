import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './AuthPage.css';
import bgImage from '../../assets/college-bg.jpg';
import { login } from '../../services/authService';
import { ROLES } from '../../constants/roles';
import { ROUTES, type RoutePath } from '../../constants/routes';
import { useAuth } from '../../hooks/useAuth';
import { getApiErrorMessage } from '../../types/api';
import type { UserRole } from '../../types/domain';

interface LoginForm {
  email: string;
  password: string;
}

// Staff accounts are created by an Admin (there is no public sign-up); this page
// is login only.
const HOME_ROUTE_BY_ROLE: Partial<Record<UserRole, RoutePath>> = {
  [ROLES.ADMIN]: ROUTES.ADMIN_DASHBOARD,
  [ROLES.LAB_INCHARGE]: ROUTES.LAB_INCHARGE_DASHBOARD,
  [ROLES.HOD]: ROUTES.HOD_DASHBOARD,
};

const INITIAL_FORM: LoginForm = { email: '', password: '' };

function AuthPage() {
  const [form, setForm] = useState<LoginForm>(INITIAL_FORM);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { setUser } = useAuth();

  const updateField =
    (field: keyof LoginForm) => (e: ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await login({ email: form.email, password: form.password });
      const user = res.data?.data?.user ?? null;
      if (user) {
        setUser(user);
      }
      const homeRoute = (user && HOME_ROUTE_BY_ROLE[user.role]) || ROUTES.LOGIN;
      navigate(homeRoute, { replace: true });
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Something went wrong. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page" style={{ backgroundImage: `url(${bgImage})` }}>
      <div className="auth-overlay" />

      <div className="auth-card">
        <div className="auth-header">
          <div className="accent-line" />
          <p className="portal-label">INTERNAL PORTAL</p>
          <h1 className="brand-title">LABMON</h1>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="field-label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            className="field-input"
            placeholder="you@college.edu"
            value={form.email}
            onChange={updateField('email')}
            required
          />

          <label className="field-label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            className="field-input"
            placeholder="••••••••"
            value={form.password}
            onChange={updateField('password')}
            required
          />

          {error && <p className="form-message form-message-error">{error}</p>}

          <button type="submit" className="submit-btn" disabled={submitting}>
            {submitting ? 'Please wait…' : 'Sign In'}
          </button>
        </form>

        <p style={{ marginTop: 20, textAlign: 'center', fontSize: 13, color: '#6b7280' }}>
          Have a lab PC issue?{' '}
          <Link to={ROUTES.RAISE_COMPLAINT} style={{ color: '#e66a0a', fontWeight: 600 }}>
            Raise a complaint
          </Link>{' '}
          or{' '}
          <Link to={ROUTES.TRACK_COMPLAINT} style={{ color: '#e66a0a', fontWeight: 600 }}>
            track one
          </Link>{' '}
          — no login needed.
        </p>
      </div>
    </div>
  );
}

export default AuthPage;
