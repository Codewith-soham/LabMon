// Mirrors backend/src/config/constants.ts ROLES — keep in sync.
// Phase 1 (D1): final role set is ADMIN, HOD, LAB_INCHARGE. `deanInfra` removed.
export const ROLES = {
  ADMIN: 'admin',
  HOD: 'hod',
  LAB_INCHARGE: 'labIncharge',
} as const;

export type UserRole = (typeof ROLES)[keyof typeof ROLES];

// The roles that sit in the complaint escalation chain (admin never does).
// Chain is Lab Incharge -> HOD; HOD is the top of the escalation chain.
export type ComplaintLevel = Exclude<UserRole, typeof ROLES.ADMIN>;

// Who a complaint escalates to next. Lab Incharge -> HOD; HOD is terminal.
export const NEXT_LEVEL: Partial<Record<UserRole, ComplaintLevel>> = {
  [ROLES.LAB_INCHARGE]: ROLES.HOD,
};

// Mirrors backend/src/config/constants.ts COMPLAINT_STATUS — keep in sync.
// Phase 1 (D3): final lifecycle is SUBMITTED -> ASSIGNED -> IN_PROGRESS -> RESOLVED -> CLOSED.
// NOTE: the backend still emits the legacy status set until Phase 2; dashboards that
// render live data will not fully line up until that migration lands.
export const COMPLAINT_STATUS = {
  SUBMITTED: 'SUBMITTED',
  ASSIGNED: 'ASSIGNED',
  IN_PROGRESS: 'IN_PROGRESS',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
} as const;

export type ComplaintStatus = (typeof COMPLAINT_STATUS)[keyof typeof COMPLAINT_STATUS];
