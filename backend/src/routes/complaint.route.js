import { Router } from "express"
import { raiseComplaint, escalateComplaint, resolveComplaint, track, list } from "../controllers/complaint.controller.js"
import { auth } from "../middlewares/auth.middleware.js"
import { roleCheck } from "../middlewares/roleCheck.middleware.js"
import { ROLES } from "../config/constants.js"
import { deptScope } from "../middlewares/deptScope.middleware.js"

const router = Router()

router.post("/", raiseComplaint) //public
router.patch("/:id/escalate", auth, roleCheck(ROLES.LAB_INCHARGE, ROLES.HOD), escalateComplaint)
router.patch("/:id/resolve", auth, roleCheck(ROLES.LAB_INCHARGE, ROLES.HOD, ROLES.DEAN_INFRA), resolveComplaint)
router.get("/track/:token", track)
router.get("/", auth, deptScope, list)

export default router
