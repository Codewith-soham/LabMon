// Phase 2 data migration: bring existing records onto the V1 role/status model.
//
//   role  deanInfra            -> admin
//   status Open                -> SUBMITTED
//          Escalated_HOD       -> SUBMITTED   (currentLevel already "hod")
//          Escalated_Dean      -> SUBMITTED   (+ currentLevel -> "hod")
//          Resolved            -> RESOLVED
//   currentLevel deanInfra     -> hod
//   history[].level deanInfra  -> hod
//
// Idempotent: re-running it is a no-op once every document is migrated.
// Dry run (no writes, just counts):  npm run migrate:roles-statuses -- --dry-run
// Apply:                             npm run migrate:roles-statuses
//
// IMPORTANT: point MONGO_URL at a backup / non-production copy first. This script
// was NOT run against any shared database as part of Phase 2.

import mongoose from "mongoose";
import dotenv from "dotenv";
import { User } from "../models/user.model.js";
import { Complaint } from "../models/complaint.model.js";

dotenv.config();

const DRY_RUN = process.argv.includes("--dry-run");

const LEGACY_STATUS_TO_V1: Record<string, string> = {
  Open: "SUBMITTED",
  Escalated_HOD: "SUBMITTED",
  Escalated_Dean: "SUBMITTED",
  Resolved: "RESOLVED",
};

const run = async (): Promise<void> => {
  await mongoose.connect(process.env.MONGO_URL as string);
  console.log(`MongoDB connected${DRY_RUN ? " (DRY RUN - no writes)" : ""}`);

  const userColl = User.collection;
  const complaintColl = Complaint.collection;

  // 1. users: deanInfra -> admin
  const deanUsers = await userColl.countDocuments({ role: "deanInfra" });
  console.log(`users role=deanInfra -> admin : ${deanUsers}`);
  if (!DRY_RUN && deanUsers > 0) {
    const r = await userColl.updateMany({ role: "deanInfra" }, { $set: { role: "admin" } });
    console.log(`  modified ${r.modifiedCount}`);
  }

  // 2. complaints: legacy status -> V1 status
  for (const [legacy, v1] of Object.entries(LEGACY_STATUS_TO_V1)) {
    const count = await complaintColl.countDocuments({ status: legacy });
    console.log(`complaints status=${legacy} -> ${v1} : ${count}`);
    if (!DRY_RUN && count > 0) {
      const r = await complaintColl.updateMany({ status: legacy }, { $set: { status: v1 } });
      console.log(`  modified ${r.modifiedCount}`);
    }
  }

  // 3. complaints: currentLevel deanInfra -> hod (was the old top of the chain)
  const deanLevel = await complaintColl.countDocuments({ currentLevel: "deanInfra" });
  console.log(`complaints currentLevel=deanInfra -> hod : ${deanLevel}`);
  if (!DRY_RUN && deanLevel > 0) {
    const r = await complaintColl.updateMany(
      { currentLevel: "deanInfra" },
      { $set: { currentLevel: "hod" } },
    );
    console.log(`  modified ${r.modifiedCount}`);
  }

  // 4. complaints: history[].level deanInfra -> hod
  const historyDean = await complaintColl.countDocuments({ "history.level": "deanInfra" });
  console.log(`complaints with history.level=deanInfra -> hod : ${historyDean}`);
  if (!DRY_RUN && historyDean > 0) {
    const r = await complaintColl.updateMany(
      { "history.level": "deanInfra" },
      { $set: { "history.$[entry].level": "hod" } },
      { arrayFilters: [{ "entry.level": "deanInfra" }] },
    );
    console.log(`  modified ${r.modifiedCount}`);
  }

  console.log(DRY_RUN ? "DRY RUN complete - nothing written." : "Migration complete.");
  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
