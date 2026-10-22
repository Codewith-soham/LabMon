// Integration tests for GET /api/v1/pc/search. Runs the real Express app
// in-process against MONGO_URL from .env. Seeds two departments (each with
// one lab and a couple of PCs) plus one user per role (labIncharge/hod in
// dept A, labIncharge in dept B, admin with no department) and logs each in
// through the real OTP flow, mirroring the pattern in auth.test.js. All
// seeded data is deleted again in `after`.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import dotenv from "dotenv";
import mongoose, { Types } from "mongoose";
import type { OtpEmailEvent } from "../utils/mailer.js";
import type { PcDocument } from "../models/pc.model.js";

dotenv.config();
process.env.NODE_ENV = "test";

const { app } = await import("../app.js");
const { User } = await import("../models/user.model.js");
const { Dept } = await import("../models/department.model.js");
const { Lab } = await import("../models/lab.model.js");
const { Pc } = await import("../models/pc.model.js");
const { ROLES } = await import("../config/constants.js");
const { createUserToken, cleanupTestUsers } = await import("./helpers.js");

let server: Server;
let baseUrl: string;

const createdUserIds: Types.ObjectId[] = [];
const createdDeptIds: Types.ObjectId[] = [];
const createdLabIds: Types.ObjectId[] = [];
const createdPcIds: Types.ObjectId[] = [];

// per-role access tokens, populated in `before`
const tokens = {} as Record<"labIncharge" | "hod" | "labInchargeB" | "admin", string>;

// seeded PCs, populated in `before`
const pcs = {} as Record<"pcA1" | "pcA2" | "pcB1", PcDocument>;

before(async () => {
  await mongoose.connect(process.env.MONGO_URL as string);
  server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;

  const suffix = crypto.randomBytes(6).toString("hex");

  // --- departments & labs ---
  const deptA = await Dept.create({ name: `Dept A ${suffix}`, code: `DA${suffix}` });
  const deptB = await Dept.create({ name: `Dept B ${suffix}`, code: `DB${suffix}` });
  createdDeptIds.push(deptA._id, deptB._id);

  const labA = await Lab.create({ name: `Lab A ${suffix}`, department: deptA._id });
  const labB = await Lab.create({ name: `Lab B ${suffix}`, department: deptB._id });
  createdLabIds.push(labA._id, labB._id);

  // --- PCs ---
  const pcA1 = await Pc.create({
    deadStockNo: `DSN-A1-${suffix}`,
    department: deptA._id,
    lab: labA._id,
    warranty: { status: "Active" },
    config: {
      cpu: "Intel Core i5-10400",
      ram: "16GB",
      disk: "512GB SSD",
      os: "Windows 11",
      software: ["Google Chrome", "VS Code"],
    },
  });
  const pcA2 = await Pc.create({
    deadStockNo: `DSN-A2-${suffix}`,
    department: deptA._id,
    lab: labA._id,
    warranty: { status: "Expired" },
    config: {
      cpu: "AMD Ryzen 5 5600",
      ram: "8GB",
      disk: "1TB HDD",
      os: "Ubuntu 22.04",
      software: ["Firefox"],
    },
  });
  const pcB1 = await Pc.create({
    deadStockNo: `DSN-B1-${suffix}`,
    department: deptB._id,
    lab: labB._id,
    warranty: { status: "Active" },
    config: {
      cpu: "Intel Core i5-11400",
      ram: "16GB",
      disk: "512GB SSD",
      os: "Windows 11",
      software: ["Google Chrome"],
    },
  });
  createdPcIds.push(pcA1._id, pcA2._id, pcB1._id);
  Object.assign(pcs, { pcA1, pcA2, pcB1 });

  // --- users, one per role we need tokens for ---
  tokens.labIncharge = (
    await createUserToken({ role: ROLES.LAB_INCHARGE, department: deptA._id, lab: labA._id })
  ).token;
  tokens.hod = (await createUserToken({ role: ROLES.HOD, department: deptA._id })).token;
  tokens.labInchargeB = (
    await createUserToken({ role: ROLES.LAB_INCHARGE, department: deptB._id, lab: labB._id })
  ).token;
  tokens.admin = (await createUserToken({ role: ROLES.ADMIN })).token;
});

after(async () => {
  await cleanupTestUsers();
  if (createdPcIds.length) await Pc.deleteMany({ _id: { $in: createdPcIds } });
  if (createdLabIds.length) await Lab.deleteMany({ _id: { $in: createdLabIds } });
  if (createdDeptIds.length) await Dept.deleteMany({ _id: { $in: createdDeptIds } });
  if (createdUserIds.length) await User.deleteMany({ _id: { $in: createdUserIds } });
  await mongoose.disconnect();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function getJson(path: string, { token }: { token?: string } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const body: any = await res.json();
  return { res, body };
}

test("search - rejects a request with no Authorization header (401)", async () => {
  const { res, body } = await getJson("/api/v1/pc/search");

  assert.equal(res.status, 401);
  assert.equal(body.success, false);
});

test("search - rejects a role not permitted to search (admin, 403)", async () => {
  const { res, body } = await getJson("/api/v1/pc/search", { token: tokens.admin });

  assert.equal(res.status, 403);
  assert.equal(body.success, false);
});

test("search - labIncharge with no filters sees only PCs in their own department", async () => {
  const { res, body } = await getJson("/api/v1/pc/search", { token: tokens.labIncharge });

  assert.equal(res.status, 200);
  assert.equal(body.success, true);
  const ids = body.data.map((pc: any) => pc._id);
  assert.ok(ids.includes(String(pcs.pcA1._id)));
  assert.ok(ids.includes(String(pcs.pcA2._id)));
  assert.ok(!ids.includes(String(pcs.pcB1._id)));
});

test("search - hod with no filters sees only PCs in their own department", async () => {
  const { res, body } = await getJson("/api/v1/pc/search", { token: tokens.hod });

  assert.equal(res.status, 200);
  const ids = body.data.map((pc: any) => pc._id);
  assert.ok(ids.includes(String(pcs.pcA1._id)));
  assert.ok(!ids.includes(String(pcs.pcB1._id)));
});

test("search - cpu filter matches partially and case-insensitively, within department scope", async () => {
  const { res, body } = await getJson("/api/v1/pc/search?cpu=intel", { token: tokens.labIncharge });

  assert.equal(res.status, 200);
  const ids = body.data.map((pc: any) => pc._id);
  assert.ok(ids.includes(String(pcs.pcA1._id)));
  assert.ok(!ids.includes(String(pcs.pcA2._id))); // AMD, filtered out
});

test("search - software filter matches an element of the software array, within department scope", async () => {
  const { res, body } = await getJson("/api/v1/pc/search?software=chrome", {
    token: tokens.labIncharge,
  });

  assert.equal(res.status, 200);
  const ids = body.data.map((pc: any) => pc._id);
  assert.ok(ids.includes(String(pcs.pcA1._id)));
  assert.ok(!ids.includes(String(pcs.pcA2._id))); // only has Firefox
  assert.ok(!ids.includes(String(pcs.pcB1._id))); // other department, out of scope
});

test("search - warrantyStatus filter matches exactly", async () => {
  const { res, body } = await getJson("/api/v1/pc/search?warrantyStatus=Expired", {
    token: tokens.labIncharge,
  });

  assert.equal(res.status, 200);
  const ids = body.data.map((pc: any) => pc._id);
  assert.deepEqual(ids, [String(pcs.pcA2._id)]);
});

test("search - a department-scoped role cannot see another department's PC even with a matching filter", async () => {
  const { res, body } = await getJson("/api/v1/pc/search?cpu=intel", { token: tokens.labIncharge });

  assert.equal(res.status, 200);
  const ids = body.data.map((pc: any) => pc._id);
  assert.ok(!ids.includes(String(pcs.pcB1._id)));
});

test("search - rejects an invalid warrantyStatus with 400", async () => {
  const { res, body } = await getJson("/api/v1/pc/search?warrantyStatus=bogus", {
    token: tokens.hod,
  });

  assert.equal(res.status, 400);
  assert.equal(body.success, false);
});

test("search - rejects an invalid lab id with 400", async () => {
  const { res, body } = await getJson("/api/v1/pc/search?lab=not-an-object-id", {
    token: tokens.hod,
  });

  assert.equal(res.status, 400);
  assert.equal(body.success, false);
});

test("search - regex metacharacters in a filter are treated literally, not as a pattern", async () => {
  const { res, body } = await getJson(
    `/api/v1/pc/search?${new URLSearchParams({ cpu: "i5(" }).toString()}`,
    { token: tokens.labIncharge },
  );

  assert.equal(res.status, 200);
  assert.equal(body.data.length, 0); // no cpu literally contains "i5(" - must not throw or match everything
});
