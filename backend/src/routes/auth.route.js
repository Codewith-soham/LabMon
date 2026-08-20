import { Router } from "express"
import { register, verifyEmail, resend, login, verifyLogin, refresh, logout, me } from "../controllers/auth.controller.js"
import { auth } from "../middlewares/auth.middleware.js"

const router = Router()

router.post("/register", register)
router.post("/verify-email", verifyEmail)
router.post("/resend-otp", resend)
router.post("/login", login)
router.post("/verify-login-otp", verifyLogin)
router.post("/refresh-token", refresh)
router.post("/logout", auth, logout)
router.get("/me", auth, me)

export default router