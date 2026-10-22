import { Router } from "express";
import {
  createStaff,
  getStaff,
  toggleStaffActive,
  deleteStaff,
} from "../controllers/hod.controller.js";
import { auth } from "../middlewares/auth.middleware.js";
import { roleCheck } from "../middlewares/roleCheck.middleware.js";
import { ROLES } from "../config/constants.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  createLabInchargeSchema,
  hodToggleActiveSchema,
} from "../validators/hod.validator.js";

const router = Router();

// Every /api/v1/hod/* route requires an authenticated HOD.
router.use(auth, roleCheck(ROLES.HOD));

router.post("/staff", validate(createLabInchargeSchema), createStaff);
router.get("/staff", getStaff);
router.patch("/staff/:id/active", validate(hodToggleActiveSchema), toggleStaffActive);
router.delete("/staff/:id", deleteStaff);

export default router;
