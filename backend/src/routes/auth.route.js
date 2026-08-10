import { Router } from "express"
import { register, verifyEmail, login, verifyLogin } from "../controllers/auth.controller.js"

const router = Router()

router.post("/register", register)
router.post("/verify-email", verifyEmail)
router.post("/login", login)
router.post("/verify-login-otp", verifyLogin)

export default router