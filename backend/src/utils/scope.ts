// Single source of truth for the "admin/deanInfra are unscoped, everyone else
// is department-locked" access rule, previously reimplemented independently
// in deptScope middleware and complaint.service.js.

import { ROLES } from "../config/constants.js";
import { ApiError } from "./ApiError.js";
import type { AuthTokenPayload } from "../types/auth.js";
import type { MongoFilter } from "../types/mongo.js";

// The subset of the auth payload these helpers actually read.
type ScopedUser = Pick<AuthTokenPayload, "role" | "department">;

const isDeptUnscoped = (user: ScopedUser): boolean =>
  user.role === ROLES.ADMIN || user.role === ROLES.DEAN_INFRA;

const buildDepartmentScope = (user: ScopedUser): MongoFilter => {
  if (isDeptUnscoped(user)) {
    return {};
  }
  return { department: user.department };
};

const assertDepartmentAccess = (user: ScopedUser, department: unknown, message: string): void => {
  if (!isDeptUnscoped(user) && String(department) !== String(user.department)) {
    throw new ApiError(403, message);
  }
};

// admin sees everything; labIncharge sees their department's whole queue;
// hod/deanInfra only see complaints currently escalated to their level (department-
// scoped for hod, across all departments for deanInfra) - a complaint that hasn't
// reached them yet, or that has since moved past them, is not in their view
const buildComplaintScope = (user: ScopedUser): MongoFilter => {
  if (user.role === ROLES.ADMIN) {
    return {};
  }

  if (user.role === ROLES.DEAN_INFRA) {
    return { currentLevel: ROLES.DEAN_INFRA };
  }

  if (user.role === ROLES.HOD) {
    return { department: user.department, currentLevel: ROLES.HOD };
  }

  return { department: user.department };
};

export { buildDepartmentScope, assertDepartmentAccess, buildComplaintScope };
