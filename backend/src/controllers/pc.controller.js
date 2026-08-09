import { syncPcConfig } from "../services/pc.service.js";
import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiResponse } from "../utils/ApiResponse.js"

const syncPc = asyncHandler(async(req,res) => {
    const pc = await syncPcConfig(req.body)

    return res.status(200).json(new ApiResponse(200, pc , "PC config updated"))
})

export {
    syncPc
}