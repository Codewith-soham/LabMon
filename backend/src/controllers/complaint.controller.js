import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { createComplaint, escalateComplaint as escalateComplaintService } from "../services/complaint.service.js";

const raiseComplaint = asyncHandler(async(req,res) => {
    const complaint = await createComplaint(req.body)

    return res.status(201).json(new ApiResponse(201, complaint, "Complaint raised successfully"))
})

const escalateComplaint = asyncHandler(async(req,res) => {
    const complaint = await escalateComplaintService(req.params.id, req.user)

    return res.status(200).json(new ApiResponse(200, complaint, "Complaint escalated successfully"))
})

export { raiseComplaint, escalateComplaint }