import { Router } from "express"
import { register, verifyEmail, login, verifyLogin, refresh, logout } from "../controllers/auth.controller.js"
import { auth } from "../middlewares/auth.middleware.js"

const router = Router()

router.post("/register", register)
router.post("/verify-email", verifyEmail)
router.post("/login", login)
router.post("/verify-login-otp", verifyLogin)
router.post("/refresh-token", refresh)
router.post("/logout", auth, logout)

export default router