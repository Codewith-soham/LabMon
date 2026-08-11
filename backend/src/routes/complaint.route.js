import { Router } from "express"
import { raiseComplaint, escalateComplaint } from "../controllers/complaint.controller.js"
import { auth } from "../middlewares/auth.middleware.js"
import { roleCheck } from "../middlewares/roleCheck.middleware.js"
import { ROLES } from "../config/constants.js"

const router = Router()

router.post("/", raiseComplaint) //public
router.patch("/:id/escalate", auth, roleCheck(ROLES.LAB_INCHARGE, ROLES.HOD), escalateComplaint)

export default router
