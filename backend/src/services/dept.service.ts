import { Dept } from "../models/department.model.js";
import { DEPARTMENTS } from "../config/departments.js";

/**
 * Ensures all departments defined in the master DEPARTMENTS list exist in MongoDB.
 * Uses atomic upsert so existing records are kept untouched.
 */
const ensureDepartmentsExist = async (): Promise<void> => {
  for (const dept of DEPARTMENTS) {
    await Dept.updateOne(
      { $or: [{ code: dept.code }, { name: dept.name }] },
      { $setOnInsert: { name: dept.name, code: dept.code } },
      { upsert: true },
    );
  }
};

const listDepartments = async () => {
  await ensureDepartmentsExist();
  return Dept.find().select("name code").sort("name");
};

export { listDepartments, ensureDepartmentsExist };
