// Phase 3 authorization matrix (PRD §3 / §10). Verifies that role + department +
// lab scope is enforced server-side, that deactivated accounts and stale tokens
// are rejected, and that the Admin surface is closed to non-admins.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();
process.env.NODE_ENV = "test";

const { app } = await import("../app.js");
const { User } = await import("../models/user.model.js");
const { Dept } = await import("../models/department.model.js");
const { Lab } = await import("../models/lab.model.js");
const { Pc } = await import("../models/pc.model.js");
const { Complaint } = await import("../models/complaint.model.js");
const { ROLES } = await import("../config/constants.js");
const { generateAccessToken } = await import("../utils/tokenGeneration.js");
const { createUserToken, cleanupTestUsers } = await import("./helpers.js");

let server: Server;
let baseUrl: string;

const cleanup: Record<"dept" | "lab" | "pc" | "complaint" | "user", mongoose.Types.ObjectId[]> = {
  dept: [],
  lab: [],
  pc: [],
  complaint: [],
  user: [],
};

// Two departments; dept IT has two labs (12, 13).
let itDept: mongoose.Types.ObjectId;
let mechDept: mongoose.Types.ObjectId;
let lab12: mongoose.Types.ObjectId;
let lab13: mongoose.Types.ObjectId;

let adminToken: string;
let itHodToken: string;
let lab12InchargeToken: string;
let lab13InchargeToken: string;

// complaints
let itLab12Complaint: string;
let itLab13Complaint: string;
let mechComplaint: string;

function suffix(): string {
  return crypto.randomBytes(5).toString("hex");
}

async function getJson(path: string, token?: string) {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const body: any = await res.json();
  return { res, body };
}

async function patchJson(path: string, payload: unknown, token?: string) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  const body: any = await res.json();
  return { res, body };
}

async function seedComplaint(department: mongoose.Types.ObjectId, lab: mongoose.Types.ObjectId) {
  const s = suffix();
  const pc = await Pc.create({ deadStockNo: `AZ-${s}`, department, lab });
  cleanup.pc.push(pc._id);
  const complaint = await Complaint.create({
    token: `LM-${s}`,
    pc: pc._id,
    department,
    lab,
    description: "authz fixture",
    raisedBy: { name: "Tester", contact: "0000000000" },
    currentLevel: ROLES.LAB_INCHARGE,
    history: [{ level: ROLES.LAB_INCHARGE, action: "created", by: null, at: new Date() }],
  });
  cleanup.complaint.push(complaint._id);
  return String(complaint._id);
}

before(async () => {
  await mongoose.connect(process.env.MONGO_URL as string);
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const s = suffix();
  const it = await Dept.create({ name: `IT ${s}`, code: `IT${s.slice(0, 3)}` });
  const mech = await Dept.create({ name: `MECH ${s}`, code: `ME${s.slice(0, 3)}` });
  itDept = it._id;
  mechDept = mech._id;
  cleanup.dept.push(it._id, mech._id);

  const l12 = await Lab.create({ name: "Lab 12", labNumber: 12, department: it._id });
  const l13 = await Lab.create({ name: "Lab 13", labNumber: 13, department: it._id });
  const lMech = await Lab.create({ name: "Lab 1", labNumber: 1, department: mech._id });
  lab12 = l12._id;
  lab13 = l13._id;
  cleanup.lab.push(l12._id, l13._id, lMech._id);

  ({ token: adminToken } = await createUserToken({ role: ROLES.ADMIN }));
  ({ token: itHodToken } = await createUserToken({ role: ROLES.HOD, department: it._id }));
  ({ token: lab12InchargeToken } = await createUserToken({
    role: ROLES.LAB_INCHARGE,
    department: it._id,
    lab: l12._id,
  }));
  ({ token: lab13InchargeToken } = await createUserToken({
    role: ROLES.LAB_INCHARGE,
    department: it._id,
    lab: l13._id,
  }));

  itLab12Complaint = await seedComplaint(it._id, l12._id);
  itLab13Complaint = await seedComplaint(it._id, l13._id);
  mechComplaint = await seedComplaint(mech._id, lMech._id);
});

after(async () => {
  await cleanupTestUsers();
  await Complaint.deleteMany({ _id: { $in: cleanup.complaint } });
  await Pc.deleteMany({ _id: { $in: cleanup.pc } });
  await Lab.deleteMany({ _id: { $in: cleanup.lab } });
  await Dept.deleteMany({ _id: { $in: cleanup.dept } });
  await User.deleteMany({ _id: { $in: cleanup.user } });
  await mongoose.disconnect();
  (server as any)?.closeAllConnections?.();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

// --- Admin API is admin-only -------------------------------------------------

test("admin API - admin is allowed (200)", async () => {
  const { res, body } = await getJson("/api/v1/admin/summary", adminToken);
  assert.equal(res.status, 200);
  assert.equal(body.success, true);
  assert.ok(body.data.complaints);
  assert.ok(body.data.staff);
});

test("admin API - HOD is forbidden (403)", async () => {
  const { res } = await getJson("/api/v1/admin/summary", itHodToken);
  assert.equal(res.status, 403);
});

test("admin API - Lab Incharge is forbidden (403)", async () => {
  const { res } = await getJson("/api/v1/admin/summary", lab12InchargeToken);
  assert.equal(res.status, 403);
});

test("admin API - unauthenticated is rejected (401)", async () => {
  const { res } = await getJson("/api/v1/admin/summary");
  assert.equal(res.status, 401);
});

// --- Department scope (HOD) -------------------------------------------------

test("HOD sees only their own department's complaints", async () => {
  const { res, body } = await getJson("/api/v1/complaint", itHodToken);
  assert.equal(res.status, 200);
  assert.ok(
    body.data.every((c: any) => c.department?._id === String(itDept)),
    "HOD list leaked another department",
  );
});

test("IT HOD cannot act on a MECH-department complaint (403)", async () => {
  const { res } = await patchJson(`/api/v1/complaint/${mechComplaint}/resolve`, {}, itHodToken);
  assert.equal(res.status, 403);
  assert.ok(mechDept);
});

// --- Lab scope (Lab Incharge) --------------------------------------------------

test("Lab 12 Incharge sees only Lab 12 complaints", async () => {
  const { res, body } = await getJson("/api/v1/complaint", lab12InchargeToken);
  assert.equal(res.status, 200);
  assert.ok(body.data.some((c: any) => c._id === itLab12Complaint));
  assert.ok(
    body.data.every((c: any) => c.lab?._id === String(lab12)),
    "Lab 12 Incharge list leaked another lab",
  );
});

test("Lab 12 Incharge cannot escalate a Lab 13 complaint (403)", async () => {
  const { res } = await patchJson(
    `/api/v1/complaint/${itLab13Complaint}/escalate`,
    {},
    lab12InchargeToken,
  );
  assert.equal(res.status, 403);
  assert.ok(lab13);
});

test("Lab 13 Incharge can escalate its own Lab 13 complaint (200)", async () => {
  const { res, body } = await patchJson(
    `/api/v1/complaint/${itLab13Complaint}/escalate`,
    {},
    lab13InchargeToken,
  );
  assert.equal(res.status, 200);
  assert.equal(body.data.currentLevel, ROLES.HOD);
});

// --- Account state / token freshness ----------------------------------------

test("a deactivated account cannot log in (403)", async () => {
  const s = suffix();
  const user = await User.create({
    name: "Deactivated",
    email: `deactivated.${s}@labmon.test`,
    password: "Test_password_1",
    role: ROLES.HOD,
    department: itDept,
    isActive: false,
    isEmailVerified: true,
  });
  cleanup.user.push(user._id);

  const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: user.email, password: "Test_password_1" }),
  });
  assert.equal(res.status, 403);
});

test("a token for a since-deactivated account is rejected mid-session (403)", async () => {
  const s = suffix();
  const user = await User.create({
    name: "Will Deactivate",
    email: `will.deactivate.${s}@labmon.test`,
    password: "Test_password_1",
    role: ROLES.HOD,
    department: itDept,
    isActive: true,
    isEmailVerified: true,
  });
  cleanup.user.push(user._id);
  const token = generateAccessToken(user);

  const ok = await getJson("/api/v1/complaint", token);
  assert.equal(ok.res.status, 200);

  user.isActive = false;
  await user.save({ validateBeforeSave: false });

  const denied = await getJson("/api/v1/complaint", token);
  assert.equal(denied.res.status, 403);
});

test("an access token issued before a tokenVersion bump stops working (401)", async () => {
  const s = suffix();
  const user = await User.create({
    name: "Bump",
    email: `bump.${s}@labmon.test`,
    password: "Test_password_1",
    role: ROLES.HOD,
    department: itDept,
    isActive: true,
    isEmailVerified: true,
  });
  cleanup.user.push(user._id);
  const token = generateAccessToken(user); // tokenVersion 0

  assert.equal((await getJson("/api/v1/complaint", token)).res.status, 200);

  user.tokenVersion = 1;
  await user.save({ validateBeforeSave: false });

  const { res } = await getJson("/api/v1/complaint", token);
  assert.equal(res.status, 401);
});
