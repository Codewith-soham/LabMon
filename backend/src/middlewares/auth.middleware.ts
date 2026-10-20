import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { ApiError } from "../utils/ApiError.js";
import { env } from "../config/env.js";
import { User } from "../models/user.model.js";
import type { AccessTokenClaims } from "../types/auth.js";

// Verifies the access token AND re-checks the user row on every request:
//  - the account still exists and is active (deactivation takes effect at once)
//  - the token's `tokenVersion` still matches (logout / deactivation / role
//    change bump it, invalidating every access token issued before)
// `req.user` is then populated from the database, so `role` / `department` /
// `lab` are always current rather than whatever the token was minted with.
const auth: RequestHandler = async (req, _res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const headerToken = authHeader?.startsWith("Bearer") ? authHeader.split(" ")[1] : null;
    const token = headerToken || req.cookies?.accessToken;

    if (!token) {
      throw new ApiError(401, "Authentication required");
    }

    let claims: AccessTokenClaims;
    try {
      claims = jwt.verify(token, env.JWT_ACCESS_TOKEN) as AccessTokenClaims;
    } catch {
      throw new ApiError(401, "Invalid or expired token");
    }

    const user = await User.findById(claims.id).select(
      "role department lab isActive tokenVersion",
    );

    if (!user) {
      throw new ApiError(401, "Invalid or expired token");
    }

    if (!user.isActive) {
      throw new ApiError(403, "Your account has been deactivated");
    }

    if ((user.tokenVersion ?? 0) !== (claims.tokenVersion ?? 0)) {
      throw new ApiError(401, "Session expired, please log in again");
    }

    req.user = {
      id: String(user._id),
      role: user.role,
      department: user.department ? String(user.department) : null,
      lab: user.lab ? String(user.lab) : null,
      tokenVersion: user.tokenVersion ?? 0,
    };

    next();
  } catch (err) {
    next(err);
  }
};

export { auth };
