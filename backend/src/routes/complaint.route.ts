import { Router } from "express";
import {
  raiseComplaint,
  escalateComplaint,
  resolveComplaint,
  track,
  list,
} from "../controllers/complaint.controller.js";
import { auth } from "../middlewares/auth.middleware.js";
import { roleCheck } from "../middlewares/roleCheck.middleware.js";
import { ROLES } from "../config/constants.js";
import { complaintLimiter } from "../middlewares/rateLimiter.js";
import { validate } from "../middlewares/validate.middleware.js";
import { raiseComplaintSchema, resolveComplaintSchema } from "../validators/complaint.validator.js";
import { objectIdParamSchema } from "../validators/common.validator.js";

const router = Router();

router.post("/", complaintLimiter, validate(raiseComplaintSchema), raiseComplaint); // public
router.patch(
  "/:id/escalate",
  auth,
  roleCheck(ROLES.LAB_INCHARGE, ROLES.HOD),
  validate(objectIdParamSchema, "params"),
  escalateComplaint,
);
router.patch(
  "/:id/resolve",
  auth,
  roleCheck(ROLES.LAB_INCHARGE, ROLES.HOD, ROLES.DEAN_INFRA),
  validate(objectIdParamSchema, "params"),
  validate(resolveComplaintSchema),
  resolveComplaint,
);
router.get("/track/:token", track);
router.get("/", auth, list);

export default router;
