import Router from "express"
import { syncPc,PcHealthCard} from "../controllers/pc.controller.js";
import { auth } from "../middlewares/auth.middleware.js"
import { deptScope } from "../middlewares/deptScope.middleware.js"

const router = Router()

router.post("/sync", syncPc)
router.post("/:id/health-card", auth, deptScope, PcHealthCard)

export default router
