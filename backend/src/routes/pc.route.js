import { Router } from "express"
import { syncPc,PcHealthCard, searchPc, lookupPc} from "../controllers/pc.controller.js";
import { auth } from "../middlewares/auth.middleware.js"
import { deptScope } from "../middlewares/deptScope.middleware.js"
import { roleCheck } from "../middlewares/roleCheck.middleware.js"
import { ROLES } from "../config/constants.js"

const router = Router()

router.post("/sync", syncPc)
// Public — lets the unauthenticated raise-complaint form confirm a dead stock number
// is real and show its department/lab before submitting.
router.get("/lookup/:deadStockNo", lookupPc)
router.get("/search", auth, roleCheck(ROLES.LAB_INCHARGE, ROLES.HOD, ROLES.DEAN_INFRA), deptScope, searchPc)
router.post("/:id/health-card", auth, deptScope, PcHealthCard)

export default router
