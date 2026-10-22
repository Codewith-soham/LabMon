import { nanoid } from "nanoid"; // used to generate random IDs
import {
  Complaint,
  type ComplaintDocument,
  type IComplaintHistoryEntry,
} from "../models/complaint.model.js";
import { Pc } from "../models/pc.model.js";
// Never referenced directly below, but escalate/resolve populate("lab", ...) / ("department", ...)
// on the complaint doc, which requires the "Lab"/"Dept" schemas to be registered with mongoose first.
import "../models/lab.model.js";
import "../models/department.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ROLES, COMPLAINT_STATUS, NEXT_LEVEL, TERMINAL_STATUSES } from "../config/constants.js";
import { assertLabAccess, buildComplaintScope } from "../utils/scope.js";
import type { AuthTokenPayload } from "../types/auth.js";

export interface CreateComplaintInput {
  deadStockNo: string;
  description: string;
  raisedBy: {
    name: string;
    contact: string;
  };
}

const createComplaint = async ({
  deadStockNo,
  description,
  raisedBy,
}: CreateComplaintInput): Promise<ComplaintDocument> => {
  const pc = await Pc.findOne({ deadStockNo: String(deadStockNo || "").trim() });

  if (!pc) {
    throw new ApiError(404, "PC not found");
  }

  const complaintToken = nanoid(8);

  const complaint = await Complaint.create({
    token: complaintToken,
    pc: pc._id,
    department: pc.department,
    lab: pc.lab ?? null,
    description,
    raisedBy,
    status: COMPLAINT_STATUS.SUBMITTED,
    currentLevel: ROLES.LAB_INCHARGE,
    history: [
      {
        level: ROLES.LAB_INCHARGE,
        action: "created",
        by: null,
        at: new Date(),
      },
    ],
  });

  return complaint;
};

const escalateComplaint = async (
  complaintId: string,
  user: AuthTokenPayload,
): Promise<ComplaintDocument> => {
  const complaint = await Complaint.findById(complaintId);

  if (!complaint) {
    throw new ApiError(404, "Complaint not found");
  }

  if (TERMINAL_STATUSES.includes(complaint.status)) {
    throw new ApiError(400, "Cannot escalate a resolved or closed complaint");
  }

  assertLabAccess(
    user,
    complaint.department,
    complaint.lab,
    "You are not authorized to escalate this complaint",
  );

  if (user.role !== complaint.currentLevel) {
    throw new ApiError(403, "Only the current level's incharge can escalate this complaint");
  }

  const nextLevel = NEXT_LEVEL[complaint.currentLevel];

  if (!nextLevel) {
    // labIncharge -> hod is the only hop; a complaint already at hod has nowhere to go.
    throw new ApiError(400, "Complaint is already at the highest escalation level");
  }

  // Escalation moves ownership to the next level; `status` is part of a separate
  // lifecycle (SUBMITTED -> ... -> RESOLVED) and is deliberately left untouched here.
  complaint.currentLevel = nextLevel;

  complaint.history.push({
    level: nextLevel,
    action: "escalated",
    by: user.id,
    at: new Date(),
  });

  await complaint.save();
  await complaint.populate([
    { path: "lab", select: "name" },
    { path: "department", select: "name" },
    { path: "history.by", select: "name" },
  ]);

  return complaint;
};

const resolveComplaint = async (
  complaintId: string,
  user: AuthTokenPayload,
  remarks: string | undefined,
): Promise<ComplaintDocument> => {
  const complaint = await Complaint.findById(complaintId);

  if (!complaint) {
    throw new ApiError(404, "Complaint not found");
  }

  if (TERMINAL_STATUSES.includes(complaint.status)) {
    throw new ApiError(400, "Complaint is already resolved");
  }

  assertLabAccess(
    user,
    complaint.department,
    complaint.lab,
    "You are not authorized to resolve this complaint",
  );

  if (
    user.role !== complaint.currentLevel &&
    user.role !== ROLES.HOD &&
    user.role !== ROLES.ADMIN
  ) {
    throw new ApiError(403, "Only the current level's incharge, HOD, or Admin can resolve this complaint");
  }

  complaint.status = COMPLAINT_STATUS.RESOLVED;

  const resolvedEntry: IComplaintHistoryEntry = {
    level: complaint.currentLevel,
    action: "resolved",
    by: user.id,
    at: new Date(),
  };
  if (remarks !== undefined) {
    resolvedEntry.note = remarks;
  }
  complaint.history.push(resolvedEntry);

  await complaint.save();
  await complaint.populate([
    { path: "lab", select: "name" },
    { path: "department", select: "name" },
    { path: "history.by", select: "name" },
  ]);

  return complaint;
};

// complaint raiser can track the complaint by token
const trackComplaint = async (token: string) => {
  const complaint = await Complaint.findOne({ token }).select(
    "token status currentLevel description createdAt",
  ); // fields which you want back

  if (!complaint) {
    throw new ApiError(404, "Invalid tracking token");
  }

  return complaint;
};

const getComplaints = async (user: AuthTokenPayload) => {
  const scope = buildComplaintScope(user);

  const complaints = await Complaint.find(scope)
    .sort({ createdAt: -1 }) // descending order
    .populate("lab", "name")
    .populate("department", "name")
    .populate("history.by", "name");

  return complaints;
};

export { createComplaint, escalateComplaint, resolveComplaint, trackComplaint, getComplaints };
