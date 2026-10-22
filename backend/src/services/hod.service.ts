import mongoose, { type Types } from "mongoose";
import { User, type UserDocument } from "../models/user.model.js";
import { Dept } from "../models/department.model.js";
import { ROLES } from "../config/constants.js";
import { ApiError } from "../utils/ApiError.js";
import { sendCredentialsEmail } from "../utils/mailer.js";
import type { CreateLabInchargeInput } from "../validators/hod.validator.js";

interface CreateLabInchargeArgs extends CreateLabInchargeInput {
  hodDepartmentId: Types.ObjectId | string;
}

const createLabIncharge = async ({
  name,
  email,
  password,
  hodDepartmentId,
}: CreateLabInchargeArgs): Promise<UserDocument> => {
  if (!hodDepartmentId) {
    throw new ApiError(400, "HOD must belong to a department to create staff");
  }

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    if (existingUser.role === ROLES.ADMIN || existingUser.role === ROLES.HOD) {
      throw new ApiError(400, "Cannot overwrite an Admin or HOD account");
    }
    if (existingUser.role === ROLES.LAB_INCHARGE) {
      throw new ApiError(409, "A Lab Incharge account with this email already exists");
    }
    // If an old non-staff user account exists with this email, delete it so the new Lab Incharge account can be provisioned
    await User.deleteOne({ _id: existingUser._id });
  }

  const deptDoc = await Dept.findById(hodDepartmentId);
  if (!deptDoc) {
    throw new ApiError(400, "HOD department not found");
  }

  // Send credentials email before password gets hashed by pre('save') hook
  await sendCredentialsEmail({
    to: email,
    name,
    email,
    password,
    role: ROLES.LAB_INCHARGE,
    departmentName: deptDoc.name,
  });

  const user = new User({
    name,
    email,
    password,
    role: ROLES.LAB_INCHARGE,
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

const listLabIncharges = async (
  hodDepartmentId: Types.ObjectId | string,
): Promise<UserDocument[]> => {
  if (!hodDepartmentId) {
    return [];
  }

  return User.find({
    role: ROLES.LAB_INCHARGE,
    department: hodDepartmentId,
  })
    .select("-password -refreshToken -otp -otpExpiry -otpPurpose -otpAttempts -lastOtpSentAt")
    .populate("department", "name code")
    .sort({ createdAt: -1 });
};

const toggleLabInchargeActive = async (
  id: string,
  isActive: boolean,
  hodDepartmentId: Types.ObjectId | string,
): Promise<UserDocument> => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid user ID format");
  }

  const user = await User.findOne({ _id: id, role: ROLES.LAB_INCHARGE });
  if (!user) {
    throw new ApiError(404, "Lab Incharge account not found");
  }

  // Enforce HOD department boundary
  if (!user.department || user.department.toString() !== hodDepartmentId.toString()) {
    throw new ApiError(403, "You do not have permission to modify staff from another department");
  }

  user.isActive = isActive;
  // If deactivating, bump tokenVersion to invalidate existing tokens
  if (!isActive) {
    user.tokenVersion += 1;
  }
  await user.save();

  const updatedUser = await User.findById(id)
    .select("-password -refreshToken -otp -otpExpiry -otpPurpose -otpAttempts -lastOtpSentAt")
    .populate("department", "name code");

  return updatedUser!;
};

const deleteLabIncharge = async (
  id: string,
  hodDepartmentId: Types.ObjectId | string,
): Promise<void> => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid user ID format");
  }

  const user = await User.findOne({ _id: id, role: ROLES.LAB_INCHARGE });
  if (!user) {
    throw new ApiError(404, "Lab Incharge account not found");
  }

  // Enforce HOD department boundary
  if (!user.department || user.department.toString() !== hodDepartmentId.toString()) {
    throw new ApiError(403, "You do not have permission to delete staff from another department");
  }

  await User.deleteOne({ _id: id });
};

export { createLabIncharge, listLabIncharges, toggleLabInchargeActive, deleteLabIncharge };
