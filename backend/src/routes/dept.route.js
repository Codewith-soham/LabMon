import { Router } from "express"
import { getDepartments } from "../controllers/dept.controller.js"

const router = Router()

router.get("/", getDepartments)

export default router
