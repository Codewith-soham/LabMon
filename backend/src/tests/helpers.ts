// Shared helpers for the integration tests. `_setup.ts` loads the environment
// before this module is imported, so a normal static import is safe here.

import crypto from "node:crypto";
import mongoose from "mongoose";
import { User } from "../models/user.model.js";
import { generateAccessToken } from "../utils/tokenGeneration.js";
import type { Role } from "../config/constants.js";

type Id = mongoose.Types.ObjectId | string | null | undefined;

const createdUserIds: mongoose.Types.ObjectId[] = [];

export interface TestUser {
  token: string;
  userId: mongoose.Types.ObjectId;
}

// Creates a real, active, verified User row and returns an access token for it.
// The auth middleware re-reads the user on every request (isActive + tokenVersion
// checks), so tests must mint tokens from persisted users, not bare ObjectIds.
export async function createUserToken(opts: {
  role: Role;
  department?: Id;
  lab?: Id;
}): Promise<TestUser> {
  const suffix = crypto.randomBytes(6).toString("hex");
  const user = await User.create({
    name: `Test ${opts.role} ${suffix}`,
    email: `test.${opts.role}.${suffix}@labmon.test`.toLowerCase(),
    password: "Test_password_1",
    role: opts.role,
    department: opts.department ?? null,
    lab: opts.lab ?? null,
    isActive: true,
    isEmailVerified: true,
  });
  createdUserIds.push(user._id);
  return { token: generateAccessToken(user), userId: user._id };
}

// Call from each suite's `after()` hook.
export async function cleanupTestUsers(): Promise<void> {
  const ids = createdUserIds.splice(0);
  if (ids.length) {
    await User.deleteMany({ _id: { $in: ids } });
  }
}
