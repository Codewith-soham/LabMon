// Centralizing roles and complaint_status so that we can change a role/status in
// one place without updating it in different files.

import { env } from "./env.js";

export const ROLES = {
  ADMIN: "admin",
  LAB_INCHARGE: "labIncharge",
  HOD: "hod",
  DEAN_INFRA: "deanInfra",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

// Admin is never a complaint escalation level - only these three sit in the chain.
export type ComplaintLevel = Exclude<Role, typeof ROLES.ADMIN>;

export const COMPLAINT_STATUS = {
  OPEN: "Open",
  ESCALATED_HOD: "Escalated_HOD",
  ESCALATED_DEAN: "Escalated_Dean",
  RESOLVED: "Resolved",
} as const;

export type ComplaintStatus = (typeof COMPLAINT_STATUS)[keyof typeof COMPLAINT_STATUS];

// lookup table
export const NEXT_LEVEL: Partial<Record<Role, ComplaintLevel>> = {
  [ROLES.LAB_INCHARGE]: ROLES.HOD,
  [ROLES.HOD]: ROLES.DEAN_INFRA,
};

export const STATUS_FOR_LEVEL: Partial<Record<Role, ComplaintStatus>> = {
  [ROLES.HOD]: COMPLAINT_STATUS.ESCALATED_HOD,
  [ROLES.DEAN_INFRA]: COMPLAINT_STATUS.ESCALATED_DEAN,
};

export const OTP_PURPOSE = {
  EMAIL_VERIFICATION: "emailVerification",
} as const;

export type OtpPurpose = (typeof OTP_PURPOSE)[keyof typeof OTP_PURPOSE];

export const isOtpPurpose = (value: unknown): value is OtpPurpose =>
  typeof value === "string" && (Object.values(OTP_PURPOSE) as string[]).includes(value);

export const OTP_EXPIRY_MINUTES = 10;

// `|| default` (not `??`) mirrors the original Number(...) || N idiom: a 0 or
// NaN configured value falls back to the default.
export const OTP_MAX_ATTEMPTS = env.OTP_MAX_ATTEMPTS || 5;
export const OTP_RESEND_COOLDOWN_SECONDS = env.OTP_RESEND_COOLDOWN_SECONDS || 60;
