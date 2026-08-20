import { useEffect, useRef } from 'react';
import './OtpInput.css';

const OTP_LENGTH = 6;

function OtpInput({ value, onChange, status = 'idle', disabled }) {
  const inputRefs = useRef([]);
  const digits = Array.from({ length: OTP_LENGTH }, (_, i) => value[i] || '');

  useEffect(() => {
    if (status === 'idle' && !disabled) {
      inputRefs.current[0]?.focus();
    }
  }, []);

  const setDigit = (index, digit) => {
    const next = digits.slice();
    next[index] = digit;
    onChange(next.join(''));
  };

  const handleChange = (index) => (e) => {
    const raw = e.target.value.replace(/\D/g, '');
    if (!raw) {
      setDigit(index, '');
      return;
    }
    const chars = raw.split('');
    let cursor = index;
    chars.forEach((char) => {
      if (cursor < OTP_LENGTH) {
        setDigit(cursor, char);
        cursor += 1;
      }
    });
    const nextIndex = Math.min(cursor, OTP_LENGTH - 1);
    inputRefs.current[nextIndex]?.focus();
  };

  const handleKeyDown = (index) => (e) => {
    if (e.key === 'Backspace') {
      if (digits[index]) {
        setDigit(index, '');
      } else if (index > 0) {
        inputRefs.current[index - 1]?.focus();
        setDigit(index - 1, '');
      }
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (pasted) {
      onChange(pasted.padEnd(OTP_LENGTH, '').slice(0, OTP_LENGTH).replace(/ /g, ''));
      const nextIndex = Math.min(pasted.length, OTP_LENGTH - 1);
      inputRefs.current[nextIndex]?.focus();
    }
  };

  return (
    <div className={`otp-input otp-input-${status}`} onPaste={handlePaste}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => (inputRefs.current[index] = el)}
          type="text"
          inputMode="numeric"
          maxLength={1}
          className="otp-box"
          value={digit}
          disabled={disabled}
          onChange={handleChange(index)}
          onKeyDown={handleKeyDown(index)}
          aria-label={`Digit ${index + 1}`}
        />
      ))}
    </div>
  );
}

export default OtpInput;
