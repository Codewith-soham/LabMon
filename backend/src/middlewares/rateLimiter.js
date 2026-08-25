// Rate limiters for public/auth-free endpoints that are otherwise unthrottled
// (login/OTP guessing, complaint/pc-sync flooding). Disabled during automated
// tests (NODE_ENV=test) so the test suite's rapid sequential requests against
// the same in-process server don't trip these limits.

import rateLimit from "express-rate-limit";

const isTestEnv = process.env.NODE_ENV === "test";

const makeLimiter = ({ windowMs, max, message }) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => isTestEnv,
    handler: (req, res) => {
      res.status(429).json({ success: false, statusCode: 429, message, errors: [] });
    },
  });

const loginLimiter = makeLimiter({
  windowMs: Number(process.env.RATE_LIMIT_LOGIN_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_LOGIN_MAX) || 10,
  message: "Too many login attempts. Please try again later.",
});

const otpVerifyLimiter = makeLimiter({
  windowMs: Number(process.env.RATE_LIMIT_OTP_VERIFY_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_OTP_VERIFY_MAX) || 10,
  message: "Too many verification attempts. Please try again later.",
});

const otpResendLimiter = makeLimiter({
  windowMs: Number(process.env.RATE_LIMIT_OTP_RESEND_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_OTP_RESEND_MAX) || 5,
  message: "Too many OTP requests. Please try again later.",
});

const complaintLimiter = makeLimiter({
  windowMs: Number(process.env.RATE_LIMIT_COMPLAINT_WINDOW_MS) || 60 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_COMPLAINT_MAX) || 20,
  message: "Too many complaints submitted. Please try again later.",
});

const pcSyncLimiter = makeLimiter({
  windowMs: Number(process.env.RATE_LIMIT_PC_SYNC_WINDOW_MS) || 60 * 1000,
  max: Number(process.env.RATE_LIMIT_PC_SYNC_MAX) || 30,
  message: "Too many sync requests. Please try again later.",
});

export { loginLimiter, otpVerifyLimiter, otpResendLimiter, complaintLimiter, pcSyncLimiter };
