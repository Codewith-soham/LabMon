import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { requireAuth } from "../utils/requireAuth.js";
import {
  createComplaint,
  escalateComplaint as escalateComplaintService,
  resolveComplaint as resolveComplaintService,
  trackComplaint,
  getComplaints,
  type CreateComplaintInput,
} from "../services/complaint.service.js";
import type { ResolveComplaintInput } from "../validators/complaint.validator.js";

const raiseComplaint = asyncHandler<Record<string, string>, unknown, CreateComplaintInput>(
  async (req, res) => {
    const complaint = await createComplaint(req.body);

    res.status(201).json(new ApiResponse(201, complaint, "Complaint raised successfully"));
  },
);

const escalateComplaint = asyncHandler<{ id: string }>(async (req, res) => {
  const user = requireAuth(req);
  const complaint = await escalateComplaintService(req.params.id, user);

  res.status(200).json(new ApiResponse(200, complaint, "Complaint escalated successfully"));
});

const resolveComplaint = asyncHandler<{ id: string }, unknown, ResolveComplaintInput>(
  async (req, res) => {
    const user = requireAuth(req);
    const complaint = await resolveComplaintService(req.params.id, user, req.body.remarks);

    res.status(200).json(new ApiResponse(200, complaint, "Complaint resolved successfully"));
  },
);

const track = asyncHandler<{ token: string }>(async (req, res) => {
  const complaint = await trackComplaint(req.params.token);

  res.status(200).json(new ApiResponse(200, complaint, "Complaint status fetched"));
});

const list = asyncHandler(async (req, res) => {
  const user = requireAuth(req);
  const complaintList = await getComplaints(user);

  res.status(200).json(new ApiResponse(200, complaintList, "Complaints fetched"));
});

export { raiseComplaint, escalateComplaint, resolveComplaint, track, list };
