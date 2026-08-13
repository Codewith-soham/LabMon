import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { createComplaint, escalateComplaint as escalateComplaintService, resolveComplaint as resolveComplaintService, trackComplaint, getComplaints} from "../services/complaint.service.js";

const raiseComplaint = asyncHandler(async(req,res) => {
    const complaint = await createComplaint(req.body)

    return res.status(201).json(new ApiResponse(201, complaint, "Complaint raised successfully"))
})

const escalateComplaint = asyncHandler(async(req,res) => {
    const complaint = await escalateComplaintService(req.params.id, req.user)

    return res.status(200).json(new ApiResponse(200, complaint, "Complaint escalated successfully"))
})

const resolveComplaint = asyncHandler(async(req,res) => {
    const complaint = await resolveComplaintService(req.params.id, req.user, req.body.remarks)

    return res.status(200).json(new ApiResponse(200, complaint, "Complaint resolved successfully"))
})

const track = asyncHandler(async(req,res) => {
    const complaint = await trackComplaint(req.params.token)

    return res.status(200).json(new ApiResponse(200, complaint, "Complaint status fetched"))
})

const list = asyncHandler(async(req,res) => {
    const complaintList = await getComplaints(req.scope)

    return res.status(200).json(new ApiResponse(200, complaintList, "Complaints fetched"))
})

export { raiseComplaint, escalateComplaint, resolveComplaint, track, list }