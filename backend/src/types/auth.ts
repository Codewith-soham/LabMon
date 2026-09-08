import type { Role } from "../config/constants.js";

// Shape of the decoded access-token payload (see utils/tokenGeneration.ts).
// After a JWT round-trip the ObjectId claims come back as strings, and
// `department` is null for the unscoped roles (admin / deanInfra).
export interface AuthTokenPayload {
  id: string;
  role: Role;
  department: string | null;
  iat?: number;
  exp?: number;
}

// Shape of the decoded refresh-token payload.
export interface RefreshTokenPayload {
  userId: string;
  iat?: number;
  exp?: number;
}
