import type { Request } from "express";
import { ApiError } from "./ApiError.js";
import type { AuthTokenPayload } from "../types/auth.js";

// Narrows `req.user` (populated by the `auth` middleware) to a non-optional
// value for handlers mounted behind it. The throw is a defensive backstop -
// every call site already runs after `auth`.
export const requireAuth = (req: Request): AuthTokenPayload => {
  if (!req.user) {
    throw new ApiError(401, "Authentication required");
  }
  return req.user;
};
