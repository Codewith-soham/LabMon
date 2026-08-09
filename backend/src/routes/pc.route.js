import Router from "express"
import { syncPc } from "../controllers/pc.controller.js";

const router = Router()

router.post("/sync", syncPc)

export default router
