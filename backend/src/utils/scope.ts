// Single source of truth for the "admin is unscoped, HOD is department-locked,
// Lab Incharge is lab-locked" access rule, previously reimplemented
// independently in deptScope middleware and complaint.service.js.

import { ROLES } from "../config/constants.js";
import { ApiError } from "./ApiError.js";
import type { AuthTokenPayload } from "../types/auth.js";
import type { MongoFilter } from "../types/mongo.js";

// The subset of the auth payload these helpers actually read.
type ScopedUser = Pick<AuthTokenPayload, "role" | "department" | "lab">;

const isDeptUnscoped = (user: ScopedUser): boolean => user.role === ROLES.ADMIN;
const isLabScoped = (user: ScopedUser): boolean => user.role === ROLES.LAB_INCHARGE;

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

// Resource-level scope: admin sees everything, HOD and Lab Incharge are limited to their department.
const buildLabScope = (user: ScopedUser): MongoFilter => {
  if (isDeptUnscoped(user)) {
    return {};
  }
  return { department: user.department };
};

// Throws 403 unless the user may act on a resource in the given department/lab.
// Admin: always. HOD: same department. Lab Incharge: same department and same lab.
const assertLabAccess = (
  user: ScopedUser,
  department: unknown,
  lab: unknown,
  message: string,
): void => {
  if (isDeptUnscoped(user)) {
    return;
  }
  if (String(department) !== String(user.department)) {
    throw new ApiError(403, message);
  }
  if (isLabScoped(user) && String(lab) !== String(user.lab)) {
    throw new ApiError(403, message);
  }
};

// admin sees everything;
// hod sees department complaints across all levels;
// labIncharge sees complaints in their own lab currently at labIncharge level.
const buildComplaintScope = (user: ScopedUser): MongoFilter => {
  if (user.role === ROLES.ADMIN) {
    return {};
  }

  if (user.role === ROLES.HOD) {
    return { department: user.department };
  }

  return { department: user.department, lab: user.lab, currentLevel: ROLES.LAB_INCHARGE };
};

export {
  buildDepartmentScope,
  assertDepartmentAccess,
  buildLabScope,
  assertLabAccess,
  buildComplaintScope,
};
