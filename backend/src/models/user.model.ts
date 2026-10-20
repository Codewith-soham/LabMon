import mongoose, { type HydratedDocument, type Model, type Types } from "mongoose";
import validator from "validator";
import bcrypt from "bcrypt";
import { ROLES, OTP_PURPOSE, type OtpPurpose, type Role } from "../config/constants.js";

export interface IUser {
  name: string;
  email: string;
  department: Types.ObjectId | null;
  // Lab assignment. Only meaningful for `labIncharge` (their one lab); `null`
  // for `hod`/`admin`. Drives the lab-level access scope (utils/scope.ts).
  lab: Types.ObjectId | null;
  password: string;
  role: Role;
  // Deactivated accounts cannot log in and every outstanding token is rejected
  // by the auth middleware. Admin toggles this; never a self-service field.
  isActive: boolean;
  // Bumped on logout / deactivation / role change so already-issued access
  // tokens stop verifying (the claim no longer matches the stored version).
  tokenVersion: number;
  refreshToken?: string;
  isEmailVerified: boolean;
  otp?: string;
  otpExpiry?: Date;
  otpPurpose?: OtpPurpose;
  otpAttempts: number;
  lastOtpSentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserMethods {
  comparePassword(password: string): Promise<boolean>;
}

export type UserModel = Model<IUser, Record<string, never>, IUserMethods>;
export type UserDocument = HydratedDocument<IUser, IUserMethods>;

const userSchema = new mongoose.Schema<IUser, UserModel, IUserMethods>(
  {
    name: {
      type: String,
      required: true,
    },

    email: {
      type: String,
      required: [true, "email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      validate: {
        validator: (value: string) => validator.isEmail(value),
        message: "Please provide a valid email address",
      },
    },

    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Dept",
      default: null,
    },

    lab: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lab",
      default: null,
    },

    password: {
      type: String,
      required: [true, "Password is required"],
    },

    role: {
      type: String,
      enum: Object.values(ROLES),
      required: true,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    tokenVersion: {
      type: Number,
      default: 0,
    },

    refreshToken: {
      type: String,
    },

    isEmailVerified: {
      type: Boolean,
      default: false,
    },

    otp: {
      type: String,
      select: false,
    },

    otpExpiry: {
      type: Date,
      select: false,
    },

    otpPurpose: {
      type: String,
      enum: Object.values(OTP_PURPOSE),
      select: false,
    },

    otpAttempts: {
      type: Number,
      default: 0,
      select: false,
    },

    lastOtpSentAt: {
      type: Date,
      select: false,
    },
  },
  { timestamps: true },
);

// pre-save hooks
userSchema.pre("save", async function () {
  // if password is modified
  if (!this.isModified("password")) {
    return;
  }
  // hash the password
  const saltRounds = 10;
  this.password = await bcrypt.hash(this.password, saltRounds);
});

// to compare the incoming password
userSchema.methods.comparePassword = async function (
  this: HydratedDocument<IUser>,
  password: string,
): Promise<boolean> {
  return bcrypt.compare(password, this.password);
};

export const User: UserModel = mongoose.model<IUser, UserModel>("User", userSchema);
