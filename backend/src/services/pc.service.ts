import mongoose from "mongoose";
import type { Types } from "mongoose";
import { Pc, type IPcConfig, type PcDocument, type WarrantyStatus } from "../models/pc.model.js";
import { Dept } from "../models/department.model.js";
import { Lab } from "../models/lab.model.js";
import { ApiError } from "../utils/ApiError.js";
import type { MongoFilter } from "../types/mongo.js";

const escapeRegex = (str: string): string => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Resolves a department name string to its ObjectId, mirroring the exact pattern
// registerUser uses at signup (backend/src/services/auth.service.ts).
const resolveDepartmentId = async (departmentName: string): Promise<Types.ObjectId> => {
  const dept = await Dept.findOne({ name: departmentName.trim() });

  if (!dept) {
    throw new ApiError(404, `Department "${departmentName}" not found`);
  }

  return dept._id;
};

// Labs are ad-hoc, department-scoped names (unlike the fixed department list), so
// it's safe to auto-create one here rather than requiring it to pre-exist.
const resolveOrCreateLabId = async (
  labName: string,
  departmentId: Types.ObjectId,
): Promise<Types.ObjectId> => {
  const lab = await Lab.findOneAndUpdate(
    { name: labName.trim(), department: departmentId },
    { $setOnInsert: { name: labName.trim(), department: departmentId } },
    { upsert: true, new: true },
  );

  if (!lab) {
    // Unreachable with { upsert: true, new: true }, but keeps the return typed.
    throw new ApiError(500, "Failed to resolve lab");
  }

  return lab._id;
};

export interface SyncPcConfigInput {
  deadStockNo: string;
  department?: string | undefined;
  lab?: string | undefined;
  config?: Record<string, unknown> | undefined;
}

const syncPcConfig = async (payload: SyncPcConfigInput): Promise<PcDocument | null> => {
  const { deadStockNo, department, lab, config } = payload;

  if (!deadStockNo) {
    throw new ApiError(400, "deadStockNo is required");
  }

  const configSet: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config ?? {})) {
    if (value !== undefined) {
      configSet[`config.${key}`] = value;
    }
  }
  configSet["config.lastSyncedAt"] = new Date();

  const existingPc = await Pc.findOne({ deadStockNo });

  if (existingPc) {
    // PC already provisioned — this call just refreshes its hardware config.
    // department/lab are only touched if this sync explicitly provides them
    // (e.g. a technician correcting a mis-assigned PC), never cleared implicitly.
    if (department) {
      configSet["department"] = await resolveDepartmentId(department);
    }
    if (lab) {
      configSet["lab"] = await resolveOrCreateLabId(
        lab,
        (configSet["department"] as Types.ObjectId | undefined) ?? existingPc.department,
      );
    }

    return Pc.findOneAndUpdate({ deadStockNo }, { $set: configSet }, { returnDocument: "after" });
  }

  // No PC with this dead stock number yet — this is first-time provisioning, which
  // requires a department (and lab) to create the record; without one, preserve the
  // original "unknown PC" behavior instead of silently creating an orphaned record.
  if (!department) {
    throw new ApiError(404, "PC not found. Check dead stock number.");
  }
  if (!lab) {
    throw new ApiError(400, "lab is required when provisioning a new PC");
  }

  const departmentId = await resolveDepartmentId(department);
  const labId = await resolveOrCreateLabId(lab, departmentId);

  // configSet keys are prefixed ("config.cpu", ...); strip the prefix back off for
  // the nested `config` subdocument on a fresh create.
  const configForCreate = Object.fromEntries(
    Object.entries(configSet).map(([key, value]) => [key.replace("config.", ""), value]),
  ) as IPcConfig;

  return Pc.create({
    deadStockNo,
    department: departmentId,
    lab: labId,
    warranty: { status: "Active" },
    config: configForCreate,
  });
};

const getPcHealthCard = async (pcId: string, scope: MongoFilter): Promise<PcDocument> => {
  const pc = await Pc.findOne({ _id: pcId, ...scope })
    .populate("department", "name code")
    .populate("lab", "name");

  if (!pc) {
    throw new ApiError(404, "Pc not found");
  }

  return pc;
};

// Public lookup used by the unauthenticated raise-complaint form to confirm a
// dead stock number is real and show which department/lab it belongs to before submit.
const lookupPcByDeadStockNo = async (deadStockNo: string) => {
  const trimmed = String(deadStockNo || "").trim();

  if (!trimmed) {
    throw new ApiError(400, "deadStockNo is required");
  }

  const pc = await Pc.findOne({ deadStockNo: trimmed })
    .select("deadStockNo department lab")
    .populate("department", "name")
    .populate("lab", "name");

  if (!pc) {
    throw new ApiError(404, "PC not found. Check dead stock number.");
  }

  return pc;
};

export interface PcSearchParams {
  deadStockNo?: unknown;
  cpu?: unknown;
  ram?: unknown;
  disk?: unknown;
  os?: unknown;
  software?: unknown;
  warrantyStatus?: unknown;
  lab?: unknown;
}

const WARRANTY_STATUSES: readonly WarrantyStatus[] = ["Active", "Expired"];

const searchPcs = async (queryParams: PcSearchParams, scope: MongoFilter) => {
  const { deadStockNo, cpu, ram, disk, os, software, warrantyStatus, lab } = queryParams;

  const filter: MongoFilter = { ...scope };

  const addRegexFilter = (field: string, value: unknown): void => {
    if (value && String(value).trim()) {
      filter[field] = { $regex: escapeRegex(String(value).trim()), $options: "i" };
    }
  };

  addRegexFilter("deadStockNo", deadStockNo);
  addRegexFilter("config.cpu", cpu);
  addRegexFilter("config.ram", ram);
  addRegexFilter("config.disk", disk);
  addRegexFilter("config.os", os);
  addRegexFilter("config.software", software);

  if (warrantyStatus) {
    if (!WARRANTY_STATUSES.includes(warrantyStatus as WarrantyStatus)) {
      throw new ApiError(400, "Invalid warrantyStatus. Must be 'Active' or 'Expired'");
    }
    filter["warranty.status"] = warrantyStatus as WarrantyStatus;
  }

  if (lab) {
    if (!mongoose.Types.ObjectId.isValid(lab as string)) {
      throw new ApiError(400, "Invalid lab id");
    }
    filter["lab"] = lab as string;
  }

  return Pc.find(filter)
    .sort({ createdAt: -1 })
    .populate("department", "name code")
    .populate("lab", "name");
};

export { syncPcConfig, getPcHealthCard, searchPcs, lookupPcByDeadStockNo };
