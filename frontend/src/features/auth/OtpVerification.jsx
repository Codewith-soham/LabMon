import { useEffect, useState } from 'react';
import OtpInput from '../../components/common/OtpInput';
import { login, resendOtp, verifyEmailOtp, verifyLoginOtp } from '../../services/authService';

const OTP_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 30;

function OtpVerification({ email, password, purpose, onVerified, onBack }) {
  const [otp, setOtp] = useState('');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setInterval(() => setCooldown((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  useEffect(() => {
    if (otp.length === OTP_LENGTH && status !== 'success') {
      handleVerify();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp]);

  const handleVerify = async () => {
    if (otp.length !== OTP_LENGTH) return;
    setVerifying(true);
    setError('');
    try {
      let user = null;
      if (purpose === 'emailVerification') {
        await verifyEmailOtp({ email, otp });
      } else {
        const res = await verifyLoginOtp({ email, otp });
        user = res.data?.data?.user ?? null;
      }
      setStatus('success');
      setTimeout(() => onVerified(user), 500);
    } catch (err) {
      setStatus('error');
      setError(err.response?.data?.message || 'Invalid OTP. Please try again.');
      setTimeout(() => {
        setOtp('');
        setStatus('idle');
      }, 600);
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || resending) return;
    setResending(true);
    setError('');
    try {
      if (purpose === 'login') {
        await login({ email, password });
      } else {
        await resendOtp({ email, purpose });
      }
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setOtp('');
      setStatus('idle');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not resend OTP. Please try again.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="otp-verify">
      <p className="otp-subtitle">
        Enter the 6-digit code sent to <strong>{email}</strong>
      </p>

      <OtpInput value={otp} onChange={setOtp} status={status} disabled={verifying} />

      {error && <p className="form-message form-message-error otp-error">{error}</p>}

      <button
        type="button"
        className="submit-btn"
        disabled={otp.length !== OTP_LENGTH || verifying}
        onClick={handleVerify}
      >
        {verifying ? 'Verifying…' : 'Verify'}
      </button>

      <div className="otp-actions">
        <button type="button" className="link-btn" onClick={onBack}>
          Back
        </button>
        <button
          type="button"
          className="link-btn"
          onClick={handleResend}
          disabled={cooldown > 0 || resending}
        >
          {resending ? 'Sending…' : cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
        </button>
      </div>
    </div>
  );
}

export default OtpVerification;
