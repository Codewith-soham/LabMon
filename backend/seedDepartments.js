// One-time script to insert/update the standard department list.
// Idempotent: safe to re-run, upserts by department name.
// Run with: node seedDepartments.js

import mongoose from "mongoose";
import dotenv from "dotenv";
import { Dept } from "./src/models/department.model.js";

dotenv.config();

const DEPARTMENTS = [
    { name: "Computer Science", code: "CSE" },
    { name: "Information Technology", code: "IT" },
    { name: "Mechanical", code: "MECH" },
    { name: "Civil", code: "CIVIL" },
    { name: "EXTC", code: "EXTC" },
    { name: "CSEDS", code: "CSEDS" },
    { name: "AIDS", code: "AIDS" },
];

const seedDepartments = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URL);
        console.log("MongoDB connected for seeding departments");

        for (const dept of DEPARTMENTS) {
            const result = await Dept.findOneAndUpdate(
                { name: dept.name },
                { $set: dept },
                { upsert: true, new: true }
            );
            console.log(`OK: ${result.name} (${result.code}) -> ${result._id}`);
        }

        process.exit(0);
    } catch (err) {
        console.error("Seeding departments failed:", err);
        process.exit(1);
    }
};

seedDepartments();
