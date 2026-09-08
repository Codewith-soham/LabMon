// Mirrors backend/src/config/constants.ts ROLES — keep in sync.
export const ROLES = {
  ADMIN: 'admin',
  LAB_INCHARGE: 'labIncharge',
  HOD: 'hod',
  DEAN_INFRA: 'deanInfra',
} as const;

export type UserRole = (typeof ROLES)[keyof typeof ROLES];

// The three roles that sit in the complaint escalation chain (admin never does).
export type ComplaintLevel = Exclude<UserRole, typeof ROLES.ADMIN>;

// Mirrors backend/src/config/constants.ts COMPLAINT_STATUS — keep in sync.
export const COMPLAINT_STATUS = {
  OPEN: 'Open',
  ESCALATED_HOD: 'Escalated_HOD',
  ESCALATED_DEAN: 'Escalated_Dean',
  RESOLVED: 'Resolved',
} as const;

export type ComplaintStatus = (typeof COMPLAINT_STATUS)[keyof typeof COMPLAINT_STATUS];
