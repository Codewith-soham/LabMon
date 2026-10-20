import type { Role } from "../config/constants.js";

// Shape of the decoded access-token JWT (see utils/tokenGeneration.ts).
// After a JWT round-trip the ObjectId claims come back as strings, and
// `department` is null for admin (the only unscoped role).
export interface AccessTokenClaims {
  id: string;
  role: Role;
  department: string | null;
  // Must equal the user's stored `tokenVersion`, else the auth middleware
  // rejects the token (revocation on logout / deactivation / role change).
  tokenVersion: number;
  iat?: number;
  exp?: number;
}

// Shape of `req.user` after the auth middleware runs. The middleware re-reads
// the user row, so these values are always current (not whatever the token
// was minted with): `isActive` has been checked, `tokenVersion` matched, and
// `role` / `department` / `lab` reflect the database, not a stale claim.
export interface AuthTokenPayload {
  id: string;
  role: Role;
  department: string | null;
  // The user's assigned lab, or null for hod/admin. Drives lab-level scope.
  lab: string | null;
  tokenVersion: number;
  iat?: number;
  exp?: number;
}

// Shape of the decoded refresh-token payload.
export interface RefreshTokenPayload {
  userId: string;
  iat?: number;
  exp?: number;
}
