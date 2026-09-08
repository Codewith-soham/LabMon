import { Router } from "express";
import { syncPc, PcHealthCard, searchPc, lookupPc } from "../controllers/pc.controller.js";
import { auth } from "../middlewares/auth.middleware.js";
import { deptScope } from "../middlewares/deptScope.middleware.js";
import { roleCheck } from "../middlewares/roleCheck.middleware.js";
import { ROLES } from "../config/constants.js";
import { pcSyncLimiter } from "../middlewares/rateLimiter.js";
import { validate } from "../middlewares/validate.middleware.js";
import { syncPcSchema } from "../validators/pc.validator.js";
import { objectIdParamSchema } from "../validators/common.validator.js";

const router = Router();

router.post("/sync", pcSyncLimiter, validate(syncPcSchema), syncPc);
// Public — lets the unauthenticated raise-complaint form confirm a dead stock number
// is real and show its department/lab before submitting.
router.get("/lookup/:deadStockNo", lookupPc);
router.get(
  "/search",
  auth,
  roleCheck(ROLES.LAB_INCHARGE, ROLES.HOD, ROLES.DEAN_INFRA),
  deptScope,
  searchPc,
);
router.post(
  "/:id/health-card",
  auth,
  roleCheck(ROLES.LAB_INCHARGE, ROLES.HOD, ROLES.DEAN_INFRA, ROLES.ADMIN),
  validate(objectIdParamSchema, "params"),
  deptScope,
  PcHealthCard,
);

export default router;
