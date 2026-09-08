import type { CookieOptions } from "express";
import {
  registerUser,
  verifyEmailOtp,
  resendOtp,
  loginUser,
  refreshAccessToken,
  logoutUser,
  getCurrentUser,
  type RegisterInput,
  type VerifyEmailInput,
  type ResendOtpInput,
  type LoginInput,
} from "../services/auth.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { parseExpiryToMs } from "../utils/tokenGeneration.js";
import { env, isProduction } from "../config/env.js";

const cookieOptions: CookieOptions = {
  httpOnly: true, // JS cannot read the cookie in the browser
  secure: isProduction, // only send over https in production
  sameSite: "strict", // not sent on cross-site requests
};

const ACCESS_TOKEN_MAX_AGE = parseExpiryToMs(env.JWT_ACCESS_EXPIRY);
const REFRESH_TOKEN_MAX_AGE = parseExpiryToMs(env.JWT_REFRESH_EXPIRY);

const register = asyncHandler<Record<string, string>, unknown, RegisterInput>(async (req, res) => {
  const user = await registerUser(req.body);

  res
    .status(201)
    .json(new ApiResponse(201, user, "User registered. Check your email for the verification OTP"));
});

const verifyEmail = asyncHandler<Record<string, string>, unknown, VerifyEmailInput>(
  async (req, res) => {
    const { email, otp } = req.body;
    const user = await verifyEmailOtp({ email, otp });

    res.status(200).json(new ApiResponse(200, user, "Email verified successfully"));
  },
);

const resend = asyncHandler<Record<string, string>, unknown, ResendOtpInput>(async (req, res) => {
  const { email, purpose } = req.body;
  const result = await resendOtp({ email, purpose });

  res.status(200).json(new ApiResponse(200, result, "OTP resent successfully"));
});

const login = asyncHandler<Record<string, string>, unknown, LoginInput>(async (req, res) => {
  const { user, accessToken, refreshToken } = await loginUser(req.body);

  res
    .status(200)
    .cookie("accessToken", accessToken, {
      ...cookieOptions,
      maxAge: ACCESS_TOKEN_MAX_AGE,
    })
    .cookie("refreshToken", refreshToken, {
      ...cookieOptions,
      maxAge: REFRESH_TOKEN_MAX_AGE,
    })
    .json(new ApiResponse(200, { user }, "Login successful"));
});

const refresh = asyncHandler(async (req, res) => {
  const { accessToken, refreshToken } = await refreshAccessToken(req.cookies?.refreshToken);

  res
    .status(200)
    .cookie("accessToken", accessToken, {
      ...cookieOptions,
      maxAge: ACCESS_TOKEN_MAX_AGE,
    })
    .cookie("refreshToken", refreshToken, {
      ...cookieOptions,
      maxAge: REFRESH_TOKEN_MAX_AGE,
    })
    .json(new ApiResponse(200, {}, "Access token refreshed"));
});

const logout = asyncHandler(async (req, res) => {
  await logoutUser(req.user?.id);

  res
    .status(200)
    .clearCookie("accessToken", cookieOptions)
    .clearCookie("refreshToken", cookieOptions)
    .json(new ApiResponse(200, {}, "Logged out successfully"));
});

const me = asyncHandler(async (req, res) => {
  if (!req.user) {
    throw new ApiError(401, "Not authenticated");
  }

  const user = await getCurrentUser(req.user.id);

  res.status(200).json(new ApiResponse(200, { user }, "Current user fetched"));
});

export { register, verifyEmail, resend, login, refresh, logout, me };
