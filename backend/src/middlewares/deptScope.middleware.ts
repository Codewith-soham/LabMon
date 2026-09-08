// Builds the department-scoped Mongo filter for the current user.

import type { RequestHandler } from "express";
import { ApiError } from "../utils/ApiError.js";
import { buildDepartmentScope } from "../utils/scope.js";

const deptScope: RequestHandler = (req, _res, next) => {
  if (!req.user) {
    throw new ApiError(401, "Authentication required");
  }
  req.scope = buildDepartmentScope(req.user);
  next();
};

export { deptScope };
