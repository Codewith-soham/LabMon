// Centralizing roles and complaint_status so that we can change a role/status in
// one place without updating it in different files.

import { env } from "./env.js";

export const ROLES = {
  ADMIN: "admin",
  HOD: "hod",
  LAB_INCHARGE: "labIncharge",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

// Admin is never a complaint escalation level - only hod/labIncharge sit in the chain.
export type ComplaintLevel = Exclude<Role, typeof ROLES.ADMIN>;

// Complaint lifecycle (PRD §11). `status` is independent of escalation: escalating
// a complaint changes its owner level, not its status.
export const COMPLAINT_STATUS = {
  SUBMITTED: "SUBMITTED",
  ASSIGNED: "ASSIGNED",
  IN_PROGRESS: "IN_PROGRESS",
  RESOLVED: "RESOLVED",
  CLOSED: "CLOSED",
} as const;

export type ComplaintStatus = (typeof COMPLAINT_STATUS)[keyof typeof COMPLAINT_STATUS];

// Statuses a complaint can no longer be escalated or resolved from.
export const TERMINAL_STATUSES: ReadonlyArray<ComplaintStatus> = [
  COMPLAINT_STATUS.RESOLVED,
  COMPLAINT_STATUS.CLOSED,
];

// Escalation chain: Lab Incharge -> HOD. HOD is the ceiling - Admin monitors the
// system but does not sit in the escalation chain, so there is no entry past hod.
export const NEXT_LEVEL: Partial<Record<Role, ComplaintLevel>> = {
  [ROLES.LAB_INCHARGE]: ROLES.HOD,
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
