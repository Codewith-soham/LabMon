import { syncPcConfig, getPcHealthCard, searchPcs } from "../services/pc.service.js";
import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiResponse } from "../utils/ApiResponse.js"

const syncPc = asyncHandler(async(req,res) => {
    const pc = await syncPcConfig(req.body)

    return res.status(200).json(new ApiResponse(200, pc , "PC config updated"))
})

const PcHealthCard = asyncHandler(async(req,res) => {
    const pc = await getPcHealthCard(req.params.id, req.scope)

    return res.status(200).json(new ApiResponse(200, pc , "PC health card fetched"))
})

const searchPc = asyncHandler(async(req,res) => {
    const pcs = await searchPcs(req.query, req.scope)

    return res.status(200).json(new ApiResponse(200, pcs , "PC search results fetched"))
})

export {
    syncPc,
    PcHealthCard,
    searchPc
}