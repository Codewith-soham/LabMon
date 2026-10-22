import mongoose from "mongoose";
import { Complaint } from "../models/complaint.model.js";
import { User, type UserDocument } from "../models/user.model.js";
import { Dept } from "../models/department.model.js";
import { COMPLAINT_STATUS, ROLES, type ComplaintStatus, type Role } from "../config/constants.js";
import { ApiError } from "../utils/ApiError.js";
import { sendCredentialsEmail } from "../utils/mailer.js";
import { DEPARTMENTS } from "../config/departments.js";
import type { CreateHodInput } from "../validators/admin.validator.js";

type StatusCounts = Record<ComplaintStatus, number>;
type RoleCounts = Record<Role, number>;

export interface AdminSummary {
  complaints: {
    total: number;
    byStatus: StatusCounts;
  };
  staff: {
    total: number;
    active: number;
    byRole: RoleCounts;
  };
}

const zeroStatusCounts = (): StatusCounts =>
  Object.values(COMPLAINT_STATUS).reduce((acc, status) => {
    acc[status] = 0;
    return acc;
  }, {} as StatusCounts);

const zeroRoleCounts = (): RoleCounts =>
  Object.values(ROLES).reduce((acc, role) => {
    acc[role] = 0;
    return acc;
  }, {} as RoleCounts);

const getSummary = async (): Promise<AdminSummary> => {
  const [statusAgg, roleAgg, totalComplaints, totalStaff, activeStaff] = await Promise.all([
    Complaint.aggregate<{ _id: string; count: number }>([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    User.aggregate<{ _id: string; count: number }>([
      { $group: { _id: "$role", count: { $sum: 1 } } },
    ]),
    Complaint.countDocuments(),
    User.countDocuments(),
    User.countDocuments({ isActive: true }),
  ]);

  const byStatus = zeroStatusCounts();
  for (const row of statusAgg) {
    if (row._id in byStatus) {
      byStatus[row._id as ComplaintStatus] = row.count;
    }
  }

  const byRole = zeroRoleCounts();
  for (const row of roleAgg) {
    if (row._id in byRole) {
      byRole[row._id as Role] = row.count;
    }
  }

  return {
    complaints: { total: totalComplaints, byStatus },
    staff: { total: totalStaff, active: activeStaff, byRole },
  };
};

const createHod = async ({
  name,
  email,
  password,
  department,
}: CreateHodInput): Promise<UserDocument> => {
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    if (existingUser.role === ROLES.ADMIN) {
      throw new ApiError(400, "Cannot overwrite an Admin account");
    }
    if (existingUser.role === ROLES.HOD) {
      throw new ApiError(409, "An HOD account with this email already exists");
    }
    // If an old non-staff user account exists with this email, delete it so the new HOD account can be provisioned
    await User.deleteOne({ _id: existingUser._id });
  }

  let deptDoc = null;
  if (mongoose.Types.ObjectId.isValid(department)) {
    deptDoc = await Dept.findById(department);
  }
  if (!deptDoc) {
    deptDoc = await Dept.findOne({ name: department.trim() });
  }
  if (!deptDoc) {
    const match = DEPARTMENTS.find(
      (d) =>
        d.name.toLowerCase() === department.trim().toLowerCase() ||
        d.code.toLowerCase() === department.trim().toLowerCase(),
    );
    if (match) {
      deptDoc = await Dept.findOneAndUpdate(
        { code: match.code },
        { $setOnInsert: { name: match.name, code: match.code } },
        { upsert: true, new: true },
      );
    }
  }
  if (!deptDoc) {
    throw new ApiError(404, `Department "${department}" not found`);
  }

  // Send credentials email before password gets hashed by pre('save') hook
  await sendCredentialsEmail({
    to: email,
    name,
    email,
    password,
    role: ROLES.HOD,
    departmentName: deptDoc.name,
  });

  const user = new User({
    name,
    email,
    password,
    role: ROLES.HOD,
    department: deptDoc._id,
    lab: null,
    isActive: true,
    isEmailVerified: true,
    tokenVersion: 0,
  });

  await user.save();

  const savedUser = await User.findById(user._id)
    .select("-password -refreshToken -otp -otpExpiry -otpPurpose -otpAttempts -lastOtpSentAt")
    .populate("department", "name code");

  return savedUser!;
};

const listHods = async (): Promise<UserDocument[]> => {
  return User.find({ role: ROLES.HOD })
    .select("-password -refreshToken -otp -otpExpiry -otpPurpose -otpAttempts -lastOtpSentAt")
    .populate("department", "name code")
    .sort({ createdAt: -1 });
};

const toggleHodActive = async (id: string, isActive: boolean): Promise<UserDocument> => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid user ID format");
  }

  const user = await User.findOne({ _id: id, role: ROLES.HOD });
  if (!user) {
    throw new ApiError(404, "HOD account not found");
  }

  user.isActive = isActive;
  // If deactivating, bump tokenVersion to invalidate any active tokens immediately
  if (!isActive) {
    user.tokenVersion += 1;
  }
  await user.save();

  const updatedUser = await User.findById(id)
    .select("-password -refreshToken -otp -otpExpiry -otpPurpose -otpAttempts -lastOtpSentAt")
    .populate("department", "name code");

  return updatedUser!;
};

const deleteHod = async (id: string): Promise<void> => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid user ID format");
  }

  const user = await User.findOne({ _id: id, role: ROLES.HOD });
  if (!user) {
    throw new ApiError(404, "HOD account not found");
  }

  await User.deleteOne({ _id: id });
};

export { getSummary, createHod, listHods, toggleHodActive, deleteHod };
