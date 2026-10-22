import { z } from "zod";
import { ROLES } from "../config/constants.js";

// Admin-only staff creation (POST /auth/register is gated by roleCheck(ADMIN)).
// `admin` is deliberately not an accepted role - admin accounts are provisioned
// via `npm run seed:admin`, never through the API (PRD §6).
const registerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  role: z.enum([ROLES.HOD, ROLES.LAB_INCHARGE]),
  department: z.string().trim().min(1),
  lab: z.string().trim().min(1).optional(),
});

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

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ResendOtpInput = z.infer<typeof resendOtpSchema>;

export { registerSchema, loginSchema, verifyEmailSchema, resendOtpSchema };
