import { z } from "zod";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

const verifyEmailSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  otp: z.string().regex(/^\d{6}$/, "OTP must be a 6-digit code"),
});

// purpose is deliberately checked as a non-empty string, not an enum -
// resendOtp() already throws its own "Invalid OTP purpose" 400 for an
// unrecognized value, and that message is relied on elsewhere, so this
// schema stays looser and just rejects malformed shapes.
const resendOtpSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  purpose: z.string().min(1),
});

export { loginSchema, verifyEmailSchema, resendOtpSchema };
