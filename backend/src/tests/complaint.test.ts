// Integration tests for /api/v1/complaint: public raise + track, and the
// role/department-scoped escalate, resolve and list endpoints. Runs the real
// Express app in-process against MONGO_URL from .env. Access tokens are
// minted directly with generateAccessToken (same payload shape auth.service.js
// issues on login) so these tests don't need to go through the OTP login flow.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import dotenv from "dotenv";
import mongoose, { Types } from "mongoose";
import type { Role } from "../config/constants.js";

dotenv.config();
process.env.NODE_ENV = "test";

const { app } = await import("../app.js");
const { User } = await import("../models/user.model.js");
const { Dept } = await import("../models/department.model.js");
const { Lab } = await import("../models/lab.model.js");
const { Pc } = await import("../models/pc.model.js");
const { Complaint } = await import("../models/complaint.model.js");
const { ROLES, COMPLAINT_STATUS } = await import("../config/constants.js");
const { createUserToken, cleanupTestUsers } = await import("./helpers.js");

type JsonResult = { res: Response; body: any };

let server: Server;
let baseUrl: string;
const cleanupIds: Record<"complaint" | "pc" | "lab" | "dept", Types.ObjectId[]> = {
  complaint: [],
  pc: [],
  lab: [],
  dept: [],
};

before(async () => {
  await mongoose.connect(process.env.MONGO_URL as string);
  server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await cleanupTestUsers();
  if (cleanupIds.complaint.length) {
    await Complaint.deleteMany({ _id: { $in: cleanupIds.complaint } });
  }
  if (cleanupIds.pc.length) {
    await Pc.deleteMany({ _id: { $in: cleanupIds.pc } });
  }
  if (cleanupIds.lab.length) {
    await Lab.deleteMany({ _id: { $in: cleanupIds.lab } });
  }
  if (cleanupIds.dept.length) {
    await Dept.deleteMany({ _id: { $in: cleanupIds.dept } });
  }

  await mongoose.disconnect();
  (server as any)?.closeAllConnections?.();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function randomSuffix(): string {
  return crypto.randomBytes(5).toString("hex");
}

async function tokenFor({
  role,
  department,
  lab,
}: {
  role: Role;
  department: Types.ObjectId | null;
  lab?: Types.ObjectId | null;
}): Promise<string> {
  const { token } = await createUserToken({ role, department, lab });
  return token;
}

async function postJson(path: string, payload: unknown, token?: string) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
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

async function getJson(path: string, token?: string) {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const body: any = await res.json();
  return { res, body };
}

async function makePc(overrides: Record<string, unknown> = {}) {
  const suffix = randomSuffix();
  const dept = await Dept.create({
    name: `Complaint Dept ${suffix}`,
    code: `CD${suffix.slice(0, 4)}`,
  });
  const lab = await Lab.create({ name: `Complaint Lab ${suffix}`, department: dept._id });
  const pc = await Pc.create({
    deadStockNo: `CMP-${suffix}`,
    department: dept._id,
    lab: lab._id,
    config: { cpu: "Intel i5", ram: "8GB", disk: "256GB", os: "Windows 11", software: [] },
    ...overrides,
  });

  cleanupIds.pc.push(pc._id);
  cleanupIds.lab.push(lab._id);
  cleanupIds.dept.push(dept._id);

  return { pc, dept, lab };
}

async function raiseComplaint(
  pc: { deadStockNo: string },
  overrides: Record<string, unknown> = {},
) {
  const { res, body } = await postJson("/api/v1/complaint", {
    deadStockNo: pc.deadStockNo,
    description: "Monitor not turning on",
    raisedBy: { name: "Test Student", contact: "9999999999" },
    ...overrides,
  });

  if (res.status === 201) {
    cleanupIds.complaint.push(body.data._id);
  }

  return { res, body };
}

test("raise complaint - creates a SUBMITTED complaint at labIncharge level for a valid deadStockNo", async () => {
  const { pc, dept, lab } = await makePc();

  const { res, body } = await raiseComplaint(pc);

  assert.equal(res.status, 201);
  assert.equal(body.success, true);
  assert.equal(body.data.status, COMPLAINT_STATUS.SUBMITTED);
  assert.equal(body.data.currentLevel, ROLES.LAB_INCHARGE);
  assert.equal(body.data.department, String(dept._id));
  assert.equal(body.data.lab, String(lab._id));
  assert.ok(body.data.token);
  assert.equal(body.data.history.length, 1);
  assert.equal(body.data.history[0].action, "created");
});

test("raise complaint - returns 404 for an unknown deadStockNo", async () => {
  const { res, body } = await postJson("/api/v1/complaint", {
    deadStockNo: `missing-${randomSuffix()}`,
    description: "Broken",
    raisedBy: { name: "Test Student", contact: "9999999999" },
  });

  assert.equal(res.status, 404);
  assert.equal(body.success, false);
  assert.equal(body.message, "PC not found");
});

test("track complaint - returns status by token", async () => {
  const { pc } = await makePc();
  const { body: created } = await raiseComplaint(pc);

  const { res, body } = await getJson(`/api/v1/complaint/track/${created.data.token}`);

  assert.equal(res.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.token, created.data.token);
  assert.equal(body.data.status, COMPLAINT_STATUS.SUBMITTED);
});

test("track complaint - returns 404 for an unknown token", async () => {
  const { res, body } = await getJson(`/api/v1/complaint/track/does-not-exist`);

  assert.equal(res.status, 404);
  assert.equal(body.success, false);
  assert.equal(body.message, "Invalid tracking token");
});

test("escalate complaint - labIncharge in the same department moves ownership to hod, status unchanged", async () => {
  const { pc, dept, lab } = await makePc();
  const { body: created } = await raiseComplaint(pc);
  const token = await tokenFor({ role: ROLES.LAB_INCHARGE, department: dept._id, lab: lab._id });

  const { res, body } = await patchJson(
    `/api/v1/complaint/${created.data._id}/escalate`,
    {},
    token,
  );

  assert.equal(res.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.currentLevel, ROLES.HOD);
  // escalation changes the owner level only - status stays where the lifecycle left it
  assert.equal(body.data.status, COMPLAINT_STATUS.SUBMITTED);
  assert.equal(body.data.history.at(-1).action, "escalated");
  assert.equal(body.data.history.at(-1).level, ROLES.HOD);
});

test("escalate complaint - rejects a labIncharge from a different department (403)", async () => {
  const { pc } = await makePc();
  const { body: created } = await raiseComplaint(pc);
  const otherSuffix = randomSuffix();
  const otherDept = await Dept.create({
    name: `Other Complaint Dept ${otherSuffix}`,
    code: `OCD${otherSuffix.slice(0, 4)}`,
  });
  cleanupIds.dept.push(otherDept._id);

  const token = await tokenFor({ role: ROLES.LAB_INCHARGE, department: otherDept._id });
  const { res, body } = await patchJson(
    `/api/v1/complaint/${created.data._id}/escalate`,
    {},
    token,
  );

  assert.equal(res.status, 403);
  assert.equal(body.success, false);
});

test("escalate complaint - rejects a hod trying to escalate a complaint still at labIncharge level (403)", async () => {
  const { pc, dept } = await makePc();
  const { body: created } = await raiseComplaint(pc);
  const token = await tokenFor({ role: ROLES.HOD, department: dept._id });

  const { res, body } = await patchJson(
    `/api/v1/complaint/${created.data._id}/escalate`,
    {},
    token,
  );

  assert.equal(res.status, 403);
  assert.equal(body.success, false);
  assert.equal(body.message, "Only the current level's incharge can escalate this complaint");
});

test("escalate complaint - hod cannot escalate further, hod is the top of the chain (400)", async () => {
  const { pc, dept, lab } = await makePc();
  const { body: created } = await raiseComplaint(pc);
  const inchargeToken = await tokenFor({
    role: ROLES.LAB_INCHARGE,
    department: dept._id,
    lab: lab._id,
  });
  const hodToken = await tokenFor({ role: ROLES.HOD, department: dept._id });

  await patchJson(`/api/v1/complaint/${created.data._id}/escalate`, {}, inchargeToken);
  const { res, body } = await patchJson(
    `/api/v1/complaint/${created.data._id}/escalate`,
    {},
    hodToken,
  );

  assert.equal(res.status, 400);
  assert.equal(body.success, false);
  assert.equal(body.message, "Complaint is already at the highest escalation level");
});

test("resolve complaint - labIncharge resolves a SUBMITTED complaint at their level", async () => {
  const { pc, dept, lab } = await makePc();
  const { body: created } = await raiseComplaint(pc);
  const token = await tokenFor({ role: ROLES.LAB_INCHARGE, department: dept._id, lab: lab._id });

  const { res, body } = await patchJson(
    `/api/v1/complaint/${created.data._id}/resolve`,
    { remarks: "Replaced cable" },
    token,
  );

  assert.equal(res.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.status, COMPLAINT_STATUS.RESOLVED);
  assert.equal(body.data.history.at(-1).action, "resolved");
  assert.equal(body.data.history.at(-1).note, "Replaced cable");
});

test("resolve complaint - rejects resolving an already-resolved complaint (400)", async () => {
  const { pc, dept, lab } = await makePc();
  const { body: created } = await raiseComplaint(pc);
  const token = await tokenFor({ role: ROLES.LAB_INCHARGE, department: dept._id, lab: lab._id });

  await patchJson(`/api/v1/complaint/${created.data._id}/resolve`, {}, token);
  const { res, body } = await patchJson(`/api/v1/complaint/${created.data._id}/resolve`, {}, token);

  assert.equal(res.status, 400);
  assert.equal(body.success, false);
  assert.equal(body.message, "Complaint is already resolved");
});

test("list complaints - a labIncharge only sees complaints from their own department", async () => {
  const { pc: ownPc, dept: ownDept, lab: ownLab } = await makePc();
  const { pc: otherPc } = await makePc();
  const { body: ownComplaint } = await raiseComplaint(ownPc);
  await raiseComplaint(otherPc);

  const token = await tokenFor({
    role: ROLES.LAB_INCHARGE,
    department: ownDept._id,
    lab: ownLab._id,
  });
  const { res, body } = await getJson("/api/v1/complaint", token);

  assert.equal(res.status, 200);
  assert.equal(body.success, true);
  assert.ok(body.data.every((c: any) => c.department?._id === String(ownDept._id)));
  assert.ok(body.data.some((c: any) => c._id === ownComplaint.data._id));
});

test("list complaints - hod does not see a complaint still at labIncharge level", async () => {
  const { pc, dept } = await makePc();
  const { body: created } = await raiseComplaint(pc);

  const token = await tokenFor({ role: ROLES.HOD, department: dept._id });
  const { res, body } = await getJson("/api/v1/complaint", token);

  assert.equal(res.status, 200);
  assert.ok(body.data.every((c: any) => c._id !== created.data._id));
});

test("list complaints - hod sees a complaint once it is escalated to them, across their own department only", async () => {
  const { pc, dept, lab } = await makePc();
  const { body: created } = await raiseComplaint(pc);
  const inchargeToken = await tokenFor({
    role: ROLES.LAB_INCHARGE,
    department: dept._id,
    lab: lab._id,
  });
  await patchJson(`/api/v1/complaint/${created.data._id}/escalate`, {}, inchargeToken);

  const hodToken = await tokenFor({ role: ROLES.HOD, department: dept._id });
  const { res, body } = await getJson("/api/v1/complaint", hodToken);

  assert.equal(res.status, 200);
  assert.ok(body.data.some((c: any) => c._id === created.data._id));
  assert.ok(body.data.every((c: any) => c.department?._id === String(dept._id)));
});

test("list complaints - admin sees a complaint while it is still at labIncharge level (unscoped, no level filter)", async () => {
  const { pc } = await makePc();
  const { body: created } = await raiseComplaint(pc);

  const adminToken = await tokenFor({ role: ROLES.ADMIN, department: null });
  const { res, body } = await getJson("/api/v1/complaint", adminToken);

  assert.equal(res.status, 200);
  assert.ok(body.data.some((c: any) => c._id === created.data._id));
});

test("list complaints - admin sees complaints from every department", async () => {
  const { pc: pcA } = await makePc();
  const { pc: pcB } = await makePc();
  const { body: createdA } = await raiseComplaint(pcA);
  const { body: createdB } = await raiseComplaint(pcB);

  const adminToken = await tokenFor({ role: ROLES.ADMIN, department: null });
  const { res, body } = await getJson("/api/v1/complaint", adminToken);

  assert.equal(res.status, 200);
  const ids = body.data.map((c: any) => c._id);
  assert.ok(ids.includes(createdA.data._id));
  assert.ok(ids.includes(createdB.data._id));
});

test("list complaints - rejects a request with no Authorization header (401)", async () => {
  const { res, body } = await getJson("/api/v1/complaint");

  assert.equal(res.status, 401);
  assert.equal(body.success, false);
  assert.equal(body.message, "Authentication required");
});

// --- new domain model: valid values, and rejection of the legacy ones ---

test("model - the role enum accepts the V1 roles and rejects the legacy deanInfra", async () => {
  assert.deepEqual(Object.values(ROLES).sort(), ["admin", "hod", "labIncharge"]);

  await assert.rejects(
    // cast: the legacy value is intentionally invalid - we are asserting the
    // schema enum rejects it at runtime.
    User.create({
      name: "Legacy Role",
      email: `legacy.role.${randomSuffix()}@labmon.test`,
      password: "Pw_legacy_role_123",
      role: "deanInfra" as never,
    }),
    { name: "ValidationError" },
  );
});

test("model - complaint status enum accepts the V1 lifecycle and rejects legacy statuses", async () => {
  assert.deepEqual(Object.values(COMPLAINT_STATUS), [
    "SUBMITTED",
    "ASSIGNED",
    "IN_PROGRESS",
    "RESOLVED",
    "CLOSED",
  ]);

  const { pc, dept, lab } = await makePc();
  const base = {
    pc: pc._id,
    department: dept._id,
    lab: lab._id,
    description: "enum check",
    raisedBy: { name: "x", contact: "y" },
  };

  for (const legacyStatus of ["Open", "Escalated_HOD", "Escalated_Dean", "Resolved"]) {
    await assert.rejects(
      Complaint.create({
        ...base,
        token: `enum-${randomSuffix()}`,
        status: legacyStatus as never,
      }),
      { name: "ValidationError" },
      `expected legacy status "${legacyStatus}" to be rejected`,
    );
  }
});

test("model - complaint currentLevel accepts labIncharge/hod and rejects deanInfra", async () => {
  const { pc, dept, lab } = await makePc();
  const base = {
    pc: pc._id,
    department: dept._id,
    lab: lab._id,
    description: "level check",
    raisedBy: { name: "x", contact: "y" },
  };

  const ok = await Complaint.create({
    ...base,
    token: `lvl-${randomSuffix()}`,
    currentLevel: ROLES.HOD,
  });
  cleanupIds.complaint.push(ok._id);
  assert.equal(ok.currentLevel, ROLES.HOD);

  await assert.rejects(
    Complaint.create({
      ...base,
      token: `lvl-${randomSuffix()}`,
      currentLevel: "deanInfra" as never,
    }),
    { name: "ValidationError" },
  );
});

test("api - raise/escalate/resolve responses only ever expose V1 status and currentLevel values", async () => {
  const statuses = Object.values(COMPLAINT_STATUS) as string[];
  const levels = [ROLES.LAB_INCHARGE, ROLES.HOD] as string[];

  const { pc, dept, lab } = await makePc();
  const { body: created } = await raiseComplaint(pc);
  assert.ok(statuses.includes(created.data.status));
  assert.ok(levels.includes(created.data.currentLevel));

  const inchargeToken = await tokenFor({
    role: ROLES.LAB_INCHARGE,
    department: dept._id,
    lab: lab._id,
  });
  const { body: escalated } = await patchJson(
    `/api/v1/complaint/${created.data._id}/escalate`,
    {},
    inchargeToken,
  );
  assert.ok(statuses.includes(escalated.data.status));
  assert.equal(escalated.data.currentLevel, ROLES.HOD);

  const hodToken = await tokenFor({ role: ROLES.HOD, department: dept._id });
  const { body: resolved } = await patchJson(
    `/api/v1/complaint/${created.data._id}/resolve`,
    { remarks: "done" },
    hodToken,
  );
  assert.equal(resolved.data.status, COMPLAINT_STATUS.RESOLVED);
  assert.ok(levels.includes(resolved.data.currentLevel));
});
