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

// Load .env BEFORE anything pulls in src/config/env.ts (which validates env vars
// at import time). Matches server.ts. Without this, importing the models below
// would evaluate env.ts first and crash on the JWT_* vars.
import "dotenv/config";
import mongoose from "mongoose";
import { User } from "../models/user.model.js";
import { Complaint } from "../models/complaint.model.js";
import { ROLES, COMPLAINT_STATUS } from "../config/constants.js";

const DRY_RUN = process.argv.includes("--dry-run");

const LEGACY_STATUS_TO_V1: Record<string, string> = {
  Open: "SUBMITTED",
  Escalated_HOD: "SUBMITTED",
  Escalated_Dean: "SUBMITTED",
  Resolved: "RESOLVED",
};

const VALID_ROLES = Object.values(ROLES);
const VALID_STATUSES = Object.values(COMPLAINT_STATUS);
const VALID_LEVELS = VALID_ROLES.filter((r) => r !== ROLES.ADMIN);

const run = async (): Promise<void> => {
  await mongoose.connect(process.env.MONGO_URL as string);
  console.log(`MongoDB connected${DRY_RUN ? " (DRY RUN - no writes)" : ""}`);

  const userColl = User.collection;
  const complaintColl = Complaint.collection;

  let usersMigrated = 0;
  let complaintsMigrated = 0;
  let levelsMigrated = 0;
  let historyDocsMigrated = 0;
  let errors = 0;

  try {
    // 1. users: deanInfra -> admin
    const deanUsers = await userColl.countDocuments({ role: "deanInfra" });
    console.log(`users role=deanInfra -> admin : ${deanUsers}`);
    if (deanUsers > 0) {
      if (DRY_RUN) {
        usersMigrated += deanUsers;
      } else {
        const r = await userColl.updateMany({ role: "deanInfra" }, { $set: { role: "admin" } });
        console.log(`  modified ${r.modifiedCount}`);
        usersMigrated += r.modifiedCount;
      }
    }

    // 2. complaints: legacy status -> V1 status
    for (const [legacy, v1] of Object.entries(LEGACY_STATUS_TO_V1)) {
      const count = await complaintColl.countDocuments({ status: legacy });
      console.log(`complaints status=${legacy} -> ${v1} : ${count}`);
      if (count > 0) {
        if (DRY_RUN) {
          complaintsMigrated += count;
        } else {
          const r = await complaintColl.updateMany({ status: legacy }, { $set: { status: v1 } });
          console.log(`  modified ${r.modifiedCount}`);
          complaintsMigrated += r.modifiedCount;
        }
      }
    }

    // 3. complaints: currentLevel deanInfra -> hod (was the old top of the chain)
    const deanLevel = await complaintColl.countDocuments({ currentLevel: "deanInfra" });
    console.log(`complaints currentLevel=deanInfra -> hod : ${deanLevel}`);
    if (deanLevel > 0) {
      if (DRY_RUN) {
        levelsMigrated += deanLevel;
      } else {
        const r = await complaintColl.updateMany(
          { currentLevel: "deanInfra" },
          { $set: { currentLevel: "hod" } },
        );
        console.log(`  modified ${r.modifiedCount}`);
        levelsMigrated += r.modifiedCount;
      }
    }

    // 4. complaints: history[].level deanInfra -> hod
    const historyDean = await complaintColl.countDocuments({ "history.level": "deanInfra" });
    console.log(`complaints with history.level=deanInfra -> hod : ${historyDean}`);
    if (historyDean > 0) {
      if (DRY_RUN) {
        historyDocsMigrated += historyDean;
      } else {
        const r = await complaintColl.updateMany(
          { "history.level": "deanInfra" },
          { $set: { "history.$[entry].level": "hod" } },
          { arrayFilters: [{ "entry.level": "deanInfra" }] },
        );
        console.log(`  modified ${r.modifiedCount}`);
        historyDocsMigrated += r.modifiedCount;
      }
    }

    // 5. report already-correct / anomalous records (no writes)
    const totalUsers = await userColl.countDocuments({});
    const usersOnV1 = await userColl.countDocuments({ role: { $in: VALID_ROLES } });
    const usersUnknownRole = totalUsers - usersOnV1 - deanUsers;

    const totalComplaints = await complaintColl.countDocuments({});
    const complaintsStatusOnV1 = await complaintColl.countDocuments({
      status: { $in: VALID_STATUSES },
    });
    const legacyStatusTotal = (
      await Promise.all(
        Object.keys(LEGACY_STATUS_TO_V1).map((s) => complaintColl.countDocuments({ status: s })),
      )
    ).reduce((a, b) => a + b, 0);
    const complaintsUnknownStatus =
      totalComplaints - complaintsStatusOnV1 - legacyStatusTotal;

    const complaintsLevelOnV1 = await complaintColl.countDocuments({
      currentLevel: { $in: VALID_LEVELS },
    });
    const complaintsUnknownLevel = totalComplaints - complaintsLevelOnV1 - deanLevel;

    const alreadyCorrectUsers = totalUsers - deanUsers - Math.max(usersUnknownRole, 0);
    const alreadyCorrectStatus = totalComplaints - legacyStatusTotal - Math.max(complaintsUnknownStatus, 0);
    const alreadyCorrectLevel = totalComplaints - deanLevel - Math.max(complaintsUnknownLevel, 0);

    console.log("\n==== SUMMARY ====");
    console.log(`Users migrated:            ${usersMigrated}`);
    console.log(
      `Complaints migrated:      ${complaintsMigrated}  (status changes; history-array rewrites: ${historyDocsMigrated})`,
    );
    console.log(`Current levels migrated:  ${levelsMigrated}`);
    console.log(
      `Already-correct records:  users=${alreadyCorrectUsers} complaint-status=${alreadyCorrectStatus} complaint-level=${alreadyCorrectLevel}`,
    );
    if (usersUnknownRole > 0 || complaintsUnknownStatus > 0 || complaintsUnknownLevel > 0) {
      console.log(
        `WARNING - records with values that are neither legacy-mapped nor valid V1: ` +
          `users(role)=${usersUnknownRole} complaints(status)=${complaintsUnknownStatus} complaints(level)=${complaintsUnknownLevel}`,
      );
    }
    console.log(`Errors:                   ${errors}`);
  } catch (err) {
    errors += 1;
    console.error("Migration step failed:", err);
    console.log("\n==== SUMMARY ====");
    console.log(`Users migrated:            ${usersMigrated}`);
    console.log(`Complaints migrated:      ${complaintsMigrated}`);
    console.log(`Current levels migrated:  ${levelsMigrated}`);
    console.log(`Errors:                   ${errors}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(DRY_RUN ? "\nDRY RUN complete - nothing written." : "\nMigration complete.");
  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
