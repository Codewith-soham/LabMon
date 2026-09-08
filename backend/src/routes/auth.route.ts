import { Router } from "express";
import {
  register,
  verifyEmail,
  resend,
  login,
  refresh,
  logout,
  me,
} from "../controllers/auth.controller.js";
import { auth } from "../middlewares/auth.middleware.js";
import { loginLimiter, otpVerifyLimiter, otpResendLimiter } from "../middlewares/rateLimiter.js";
import { validate } from "../middlewares/validate.middleware.js";
import { loginSchema, verifyEmailSchema, resendOtpSchema } from "../validators/auth.validator.js";

const router = Router();

router.post("/register", register);
router.post("/verify-email", otpVerifyLimiter, validate(verifyEmailSchema), verifyEmail);
router.post("/resend-otp", otpResendLimiter, validate(resendOtpSchema), resend);
router.post("/login", loginLimiter, validate(loginSchema), login);
router.post("/refresh-token", refresh);
router.post("/logout", auth, logout);
router.get("/me", auth, me);

export default router;
