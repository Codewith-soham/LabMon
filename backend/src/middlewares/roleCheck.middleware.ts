import type { RequestHandler } from "express";
import { ApiError } from "../utils/ApiError.js";
import type { Role } from "../config/constants.js";

const roleCheck = (...allowedRoles: Role[]): RequestHandler => {
  return (req, _res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      throw new ApiError(403, "You do not have permission to perform this action");
    }
    next();
  };
};

export { roleCheck };
