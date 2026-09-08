export const ROUTES = {
  // Public, login-free
  RAISE_COMPLAINT: '/raise-complaint',
  TRACK_COMPLAINT: '/track-complaint',

  // Staff login entry points. Phase 1: all render the shared AuthPage; the
  // role-specific paths exist so Phase 3+ can specialise them without a route churn.
  LOGIN: '/login',
  ADMIN_LOGIN: '/admin-login',
  HOD_LOGIN: '/hod-login',
  LAB_INCHARGE_LOGIN: '/labincharge-login',

  // Staff dashboards (role-gated).
  ADMIN_DASHBOARD: '/admin-dashboard',
  HOD_DASHBOARD: '/hod-dashboard',
  LAB_INCHARGE_DASHBOARD: '/labincharge-dashboard',

  // Access control.
  FORBIDDEN: '/403',

  // Asset views (unchanged — out of V1 scope).
  LABORATORIES: '/laboratories',
  EQUIPMENT: '/equipment',
  INVENTORY: '/inventory',
  REQUESTS: '/requests',
} as const;

export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES];

// Legacy paths kept as redirects in app/routes.tsx so old bookmarks don't 404.
export const LEGACY_ROUTES = {
  LAB_INCHARGE_HOME: '/lab-incharge',
  HOD_HOME: '/hod',
  DEAN_INFRA_HOME: '/dean-infra',
} as const;
