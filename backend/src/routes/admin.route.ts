import { Router } from "express";
import { summary } from "../controllers/admin.controller.js";
import { auth } from "../middlewares/auth.middleware.js";
import { roleCheck } from "../middlewares/roleCheck.middleware.js";
import { ROLES } from "../config/constants.js";

const router = Router();

// Every /api/v1/admin/* route requires an authenticated Admin.
router.use(auth, roleCheck(ROLES.ADMIN));

router.get("/summary", summary);

export default router;
