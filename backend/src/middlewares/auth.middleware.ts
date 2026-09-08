import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { ApiError } from "../utils/ApiError.js";
import { env } from "../config/env.js";
import type { AuthTokenPayload } from "../types/auth.js";

const auth: RequestHandler = (req, _res, next) => {
  const authHeader = req.headers.authorization;
  const headerToken = authHeader?.startsWith("Bearer") ? authHeader.split(" ")[1] : null;
  const token = headerToken || req.cookies?.accessToken;

  if (!token) {
    throw new ApiError(401, "Authentication required");
  }

  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_TOKEN) as AuthTokenPayload;

    req.user = decoded;

    next();
  } catch {
    throw new ApiError(401, "Invalid or expired token");
  }
};

export { auth };
