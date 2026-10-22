import { Router } from "express";
import {
  summary,
  createStaff,
  getStaff,
  toggleStaffActive,
  deleteStaff,
} from "../controllers/admin.controller.js";
import { auth } from "../middlewares/auth.middleware.js";
import { roleCheck } from "../middlewares/roleCheck.middleware.js";
import { ROLES } from "../config/constants.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  createHodSchema,
  toggleActiveSchema,
} from "../validators/admin.validator.js";

const router = Router();

// Every /api/v1/admin/* route requires an authenticated Admin.
router.use(auth, roleCheck(ROLES.ADMIN));

router.get("/summary", summary);
router.post("/staff", validate(createHodSchema), createStaff);
router.get("/staff", getStaff);
router.patch("/staff/:id/active", validate(toggleActiveSchema), toggleStaffActive);
router.delete("/staff/:id", deleteStaff);

export default router;
