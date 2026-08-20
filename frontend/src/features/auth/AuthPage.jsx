import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './AuthPage.css';
import bgImage from '../../assets/college-bg.jpg';
import { login, register } from '../../services/authService';
import { listDepartments } from '../../services/deptService';
import { ROLES } from '../../constants/roles';
import { ROUTES } from '../../constants/routes';
import { useAuth } from '../../hooks/useAuth';
import OtpVerification from './OtpVerification';

const SIGNUP_ROLES = [
  { value: ROLES.LAB_INCHARGE, label: 'Lab Incharge' },
  { value: ROLES.HOD, label: 'HOD' },
  { value: ROLES.DEAN_INFRA, label: 'Dean Infra' },
];

const HOME_ROUTE_BY_ROLE = {
  [ROLES.LAB_INCHARGE]: ROUTES.LAB_INCHARGE_HOME,
  [ROLES.HOD]: ROUTES.HOD_HOME,
  [ROLES.DEAN_INFRA]: ROUTES.DEAN_INFRA_HOME,
};

const INITIAL_FORM = {
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
  role: ROLES.LAB_INCHARGE,
  department: '',
};

function AuthPage() {
  const [activeTab, setActiveTab] = useState('login');
  const [step, setStep] = useState('form');
  const [form, setForm] = useState(INITIAL_FORM);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [departments, setDepartments] = useState([]);
  const navigate = useNavigate();
  const { setUser } = useAuth();

  const isSignup = activeTab === 'signup';
  const departmentRequired = form.role !== ROLES.DEAN_INFRA;

  useEffect(() => {
    if (activeTab !== 'signup') return;

    let cancelled = false;
    listDepartments()
      .then((res) => {
        if (!cancelled) setDepartments(res.data?.data || []);
      })
      .catch(() => {
        if (!cancelled) setDepartments([]);
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  const updateField = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const switchTab = (tab) => {
    setActiveTab(tab);
    setError('');
    setInfo('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');

    if (isSignup && form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setSubmitting(true);
    try {
      if (isSignup) {
        await register({
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
          department: departmentRequired ? form.department : null,
        });
      } else {
        await login({ email: form.email, password: form.password });
      }
      setStep('otp');
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOtpVerified = (user) => {
    if (isSignup) {
      setStep('form');
      setActiveTab('login');
      setForm(INITIAL_FORM);
      setInfo('Email verified. You can now sign in.');
      return;
    }

    if (user) {
      setUser(user);
    }
    navigate(HOME_ROUTE_BY_ROLE[user?.role] || ROUTES.LOGIN, { replace: true });
  };

  const handleOtpBack = () => {
    setStep('form');
    setError('');
    setInfo('');
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

        {step === 'form' && (
          <>
            <div className="auth-tabs">
              <button
                type="button"
                className={`auth-tab ${activeTab === 'login' ? 'active' : ''}`}
                onClick={() => switchTab('login')}
              >
                Login
              </button>
              <button
                type="button"
                className={`auth-tab ${activeTab === 'signup' ? 'active' : ''}`}
                onClick={() => switchTab('signup')}
              >
                Sign Up
              </button>
            </div>
            <div className="auth-tabs-divider" />
          </>
        )}

        {step === 'otp' && (
          <OtpVerification
            email={form.email}
            password={form.password}
            purpose={isSignup ? 'emailVerification' : 'login'}
            onVerified={handleOtpVerified}
            onBack={handleOtpBack}
          />
        )}

        {step === 'form' && (
          <form className="auth-form" onSubmit={handleSubmit}>
            {isSignup && (
              <>
                <label className="field-label" htmlFor="name">
                  Full Name
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
              </>
            )}

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

            {isSignup && (
              <>
                <label className="field-label" htmlFor="role">
                  Role
                </label>
                <select
                  id="role"
                  className="field-input"
                  value={form.role}
                  onChange={updateField('role')}
                >
                  {SIGNUP_ROLES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                {departmentRequired && (
                  <>
                    <label className="field-label" htmlFor="department">
                      Department
                    </label>
                    <select
                      id="department"
                      className="field-input"
                      value={form.department}
                      onChange={updateField('department')}
                      required
                    >
                      <option value="" disabled>
                        {departments.length ? 'Select department' : 'Loading departments…'}
                      </option>
                      {departments.map((dept) => (
                        <option key={dept._id} value={dept.name}>
                          {dept.name}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </>
            )}

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

            {isSignup && (
              <>
                <label className="field-label" htmlFor="confirmPassword">
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  className="field-input"
                  placeholder="••••••••"
                  value={form.confirmPassword}
                  onChange={updateField('confirmPassword')}
                  required
                />
              </>
            )}

            {error && <p className="form-message form-message-error">{error}</p>}
            {info && <p className="form-message form-message-success">{info}</p>}

            <button type="submit" className="submit-btn" disabled={submitting}>
              {submitting ? 'Please wait…' : isSignup ? 'Sign Up' : 'Sign In'}
            </button>
          </form>
        )}

        {step === 'form' && (
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
        )}
      </div>
    </div>
  );
}

export default AuthPage;
