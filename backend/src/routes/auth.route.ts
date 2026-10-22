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
import { roleCheck } from "../middlewares/roleCheck.middleware.js";
import { ROLES } from "../config/constants.js";
import { loginLimiter, otpVerifyLimiter, otpResendLimiter } from "../middlewares/rateLimiter.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  resendOtpSchema,
} from "../validators/auth.validator.js";

const router = Router();

// Staff creation is Admin-only (PRD §6, §16). There is no public self-registration.
router.post("/register", auth, roleCheck(ROLES.ADMIN), validate(registerSchema), register);
router.post("/verify-email", otpVerifyLimiter, validate(verifyEmailSchema), verifyEmail);
router.post("/resend-otp", otpResendLimiter, validate(resendOtpSchema), resend);
router.post("/login", loginLimiter, validate(loginSchema), login);
router.post("/refresh-token", refresh);
router.post("/logout", auth, logout);
router.get("/me", auth, me);

export default router;
