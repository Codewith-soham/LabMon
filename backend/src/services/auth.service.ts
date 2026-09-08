import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { User, type UserDocument } from "../models/user.model.js";
import { Dept } from "../models/department.model.js";
import { ApiError } from "../utils/ApiError.js";
import { generateAccessToken, generateRefreshToken } from "../utils/tokenGeneration.js";
import { generateOtp, hashOtp, compareOtp } from "../utils/otp.js";
import { sendOtpEmail } from "../utils/mailer.js";
import {
  OTP_PURPOSE,
  OTP_EXPIRY_MINUTES,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS,
  isOtpPurpose,
  type OtpPurpose,
  type Role,
} from "../config/constants.js";
import { env } from "../config/env.js";
import type { RefreshTokenPayload } from "../types/auth.js";

const isTestEnv = env.NODE_ENV === "test";

const OTP_EXPIRY_MS = OTP_EXPIRY_MINUTES * 60 * 1000;

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  role: Role;
  department?: string | null;
}

export interface VerifyEmailInput {
  email: string;
  otp: string;
}

export interface ResendOtpInput {
  email: string;
  purpose: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthTokenPair {
  accessToken: string;
  refreshToken: string;
}

// bcrypt silently truncates its input to 72 bytes, and refresh tokens are JWTs
// well past that length, so two tokens sharing a 72-byte prefix (e.g. same
// header + userId claim, differing only in iat/exp near the end) would hash
// to the same bcrypt value. SHA-256 the raw token to a fixed 64-char digest
// first so the full token actually determines the stored hash.
const hashRefreshToken = (token: string): Promise<string> =>
  bcrypt.hash(crypto.createHash("sha256").update(token).digest("hex"), 10);
const compareRefreshToken = (token: string, hash: string): Promise<boolean> =>
  bcrypt.compare(crypto.createHash("sha256").update(token).digest("hex"), hash);

// generates an otp, stores its hash on the user, and emails the plaintext otp
const issueOtp = async (user: UserDocument, purpose: OtpPurpose): Promise<void> => {
  const otp = generateOtp();

  user.otp = await hashOtp(otp);
  user.otpExpiry = new Date(Date.now() + OTP_EXPIRY_MS);
  user.otpPurpose = purpose;
  user.otpAttempts = 0;
  user.lastOtpSentAt = new Date();
  await user.save({ validateBeforeSave: false });

  await sendOtpEmail({ to: user.email, otp, purpose });
};

const registerUser = async ({
  name,
  email,
  password,
  role,
  department,
}: RegisterInput): Promise<UserDocument> => {
  // check if user exists
  const existingUser = await User.findOne({ email });

  if (existingUser) {
    throw new ApiError(409, "User with this email already exists");
  }

  // department is submitted as a name (e.g. "Computer Science"), but the
  // User model stores a Dept ObjectId reference, so resolve it here
  let departmentId: UserDocument["department"] = null;
  if (department) {
    const dept = await Dept.findOne({ name: department.trim() });

    if (!dept) {
      throw new ApiError(404, `Department "${department}" not found`);
    }

    departmentId = dept._id;
  }

  // create user
  const user = await User.create({
    name,
    email,
    password,
    role,
    department: departmentId,
  });

  // send an otp so the user can verify their email
  await issueOtp(user, OTP_PURPOSE.EMAIL_VERIFICATION);

  // no returning of password
  user.set("password", undefined);

  return user;
};

const verifyEmailOtp = async ({ email, otp }: VerifyEmailInput): Promise<UserDocument> => {
  const user = await User.findOne({ email }).select("+otp +otpExpiry +otpPurpose +otpAttempts");

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (user.isEmailVerified) {
    throw new ApiError(400, "Email is already verified");
  }

  if (user.otpPurpose !== OTP_PURPOSE.EMAIL_VERIFICATION || !user.otp || !user.otpExpiry) {
    throw new ApiError(400, "No pending email verification for this account");
  }

  if (user.otpExpiry < new Date()) {
    throw new ApiError(400, "OTP has expired, please register again to get a new one");
  }

  if (!isTestEnv && user.otpAttempts >= OTP_MAX_ATTEMPTS) {
    throw new ApiError(429, "Too many incorrect attempts. Please request a new OTP.");
  }

  const isOtpValid = await compareOtp(otp, user.otp);

  if (!isOtpValid) {
    user.otpAttempts += 1;
    await user.save({ validateBeforeSave: false });
    throw new ApiError(400, "Invalid OTP");
  }

  user.isEmailVerified = true;
  user.set("otp", undefined);
  user.set("otpExpiry", undefined);
  user.set("otpPurpose", undefined);
  user.otpAttempts = 0;
  await user.save({ validateBeforeSave: false });

  // no returning of password
  user.set("password", undefined);

  return user;
};

const resendOtp = async ({ email, purpose }: ResendOtpInput): Promise<{ email: string }> => {
  if (!isOtpPurpose(purpose)) {
    throw new ApiError(400, "Invalid OTP purpose");
  }

  const user = await User.findOne({ email }).select("+otp +otpExpiry +otpPurpose +lastOtpSentAt");

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (user.isEmailVerified) {
    throw new ApiError(400, "Email is already verified");
  }

  if (!isTestEnv && user.lastOtpSentAt) {
    const elapsedSeconds = (Date.now() - user.lastOtpSentAt.getTime()) / 1000;
    if (elapsedSeconds < OTP_RESEND_COOLDOWN_SECONDS) {
      throw new ApiError(
        429,
        `Please wait ${Math.ceil(
          OTP_RESEND_COOLDOWN_SECONDS - elapsedSeconds,
        )} seconds before requesting another OTP`,
      );
    }
  }

  await issueOtp(user, purpose);

  return { email: user.email };
};

const loginUser = async ({
  email,
  password,
}: LoginInput): Promise<{ user: UserDocument; accessToken: string; refreshToken: string }> => {
  // find user by email
  const user = await User.findOne({ email });

  if (!user) {
    throw new ApiError(401, "Invalid email or password");
  }

  // verify password
  const isPasswordValid = await user.comparePassword(password);

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid email or password");
  }

  if (!user.isEmailVerified) {
    throw new ApiError(403, "Please verify your email before logging in");
  }

  // issue tokens
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  // persist a hash of the refresh token so it can be revoked/rotated later
  user.refreshToken = await hashRefreshToken(refreshToken);
  await user.save({ validateBeforeSave: false });

  // no returning of password
  user.set("password", undefined);

  await user.populate("department", "name");

  return { user, accessToken, refreshToken };
};

// used to rehydrate the frontend's session (e.g. on page load) from the accessToken cookie alone
const getCurrentUser = async (userId: string): Promise<UserDocument> => {
  const user = await User.findById(userId).populate("department", "name");

  if (!user) {
    throw new ApiError(401, "Not authenticated");
  }

  return user;
};

const refreshAccessToken = async (
  candidateRefreshToken: string | undefined,
): Promise<AuthTokenPair> => {
  if (!candidateRefreshToken) {
    throw new ApiError(401, "Refresh token missing");
  }

  let decoded: RefreshTokenPayload;
  try {
    decoded = jwt.verify(candidateRefreshToken, env.JWT_REFRESH_TOKEN) as RefreshTokenPayload;
  } catch {
    throw new ApiError(401, "Invalid or expired refresh token");
  }

  const user = await User.findById(decoded.userId);

  if (!user || !user.refreshToken) {
    throw new ApiError(401, "Invalid refresh token");
  }

  const isRefreshTokenValid = await compareRefreshToken(candidateRefreshToken, user.refreshToken);

  if (!isRefreshTokenValid) {
    throw new ApiError(401, "Invalid refresh token");
  }

  // rotate: issue a new access token and a new refresh token so a leaked-but-unused
  // old refresh token can no longer be replayed once this one is redeemed
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  user.refreshToken = await hashRefreshToken(refreshToken);
  await user.save({ validateBeforeSave: false });

  return { accessToken, refreshToken };
};

const logoutUser = async (userId: string | undefined): Promise<void> => {
  if (!userId) {
    throw new ApiError(401, "Not authenticated");
  }

  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(401, "Not authenticated");
  }

  user.set("refreshToken", undefined);
  await user.save({ validateBeforeSave: false });
};

export {
  registerUser,
  verifyEmailOtp,
  resendOtp,
  loginUser,
  refreshAccessToken,
  logoutUser,
  getCurrentUser,
};
