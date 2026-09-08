import jwt, { type SignOptions } from "jsonwebtoken";
import type { Types } from "mongoose";
import { env } from "../config/env.js";
import type { Role } from "../config/constants.js";

// Accepts either a hydrated User document or a plain object with the same
// identifying fields (the test suite mints tokens from the latter).
interface AccessTokenSubject {
  _id: Types.ObjectId | string;
  role: Role;
  department?: Types.ObjectId | string | null;
}

interface RefreshTokenSubject {
  _id: Types.ObjectId | string;
}

// @types/jsonwebtoken models `expiresIn` as a template-literal string union
// (`${number}${unit}` etc.) plus `number`, which a plain env string cannot be
// assigned to. The value flows straight through to jsonwebtoken's own `ms`
// parser at runtime, so this narrow cast is the documented escape hatch.
type ExpiresIn = NonNullable<SignOptions["expiresIn"]>;
const accessTokenExpiry = env.JWT_ACCESS_EXPIRY as ExpiresIn;
const refreshTokenExpiry = env.JWT_REFRESH_EXPIRY as ExpiresIn;

const generateAccessToken = (user: AccessTokenSubject): string => {
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
      department: user.department ?? null,
    },
    env.JWT_ACCESS_TOKEN,
    {
      expiresIn: accessTokenExpiry,
    },
  );
};

const generateRefreshToken = (user: RefreshTokenSubject): string => {
  return jwt.sign(
    {
      userId: user._id,
    },
    env.JWT_REFRESH_TOKEN,
    {
      expiresIn: refreshTokenExpiry,
    },
  );
};

type ExpiryUnit = "s" | "m" | "h" | "d";

const UNIT_MS: Record<ExpiryUnit, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

// Parses "15m" / "7d" / "30s" / "1h" style durations (matches jsonwebtoken's
// expiresIn format) into milliseconds.
const parseExpiryToMs = (expiry: string): number => {
  const match = /^(\d+)(s|m|h|d)$/.exec(expiry);

  if (!match) {
    throw new Error(`Unrecognized expiry format: ${expiry}`);
  }

  // Both capture groups are present when the regex matches, and group 2 is
  // constrained to the ExpiryUnit alternation by the pattern itself.
  const value = Number(match[1]);
  const unit = match[2] as ExpiryUnit;

  return value * UNIT_MS[unit];
};

export { generateAccessToken, generateRefreshToken, parseExpiryToMs };
