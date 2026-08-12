import mongoose from "mongoose";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { createComplaint, escalateComplaint as escalateComplaintService, resolveComplaint as resolveComplaintService } from "../services/complaint.service.js";

const raiseComplaint = asyncHandler(async(req,res) => {
    const complaint = await createComplaint(req.body)

    return res.status(201).json(new ApiResponse(201, complaint, "Complaint raised successfully"))
})

const escalateComplaint = asyncHandler(async(req,res) => {
    if(!mongoose.Types.ObjectId.isValid(req.params.id)){
        throw new ApiError(400, "Invalid complaint id")
    }

    const complaint = await escalateComplaintService(req.params.id, req.user)

    return res.status(200).json(new ApiResponse(200, complaint, "Complaint escalated successfully"))
})

const resolveComplaint = asyncHandler(async(req,res) => {
    const complaint = await resolveComplaintService(req.params.id, req.user, req.body.remarks)

    return res.status(200).json(new ApiResponse(200, complaint, "Complaint resolved successfully"))
})

export { raiseComplaint, escalateComplaint, resolveComplaint }