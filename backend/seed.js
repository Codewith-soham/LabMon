// seed.js
// One-time script to insert test Department, Lab, and PC documents for local testing.
// Run with: node seed.js
// Place this file in your backend/ folder (same level as server.js), adjust import paths if needed.

import mongoose from "mongoose";
import dotenv from "dotenv";
import { Dept } from "./src/models/department.model.js";
import { Lab } from "./src/models/lab.model.js";
import { Pc } from "./src/models/pc.model.js";

dotenv.config();

const seed = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URL);
        console.log("MongoDB connected for seeding");

        // Clean up any previous test data with the same identifiers (safe to re-run)
        await Dept.deleteOne({ code: "CSE" });
        await Lab.deleteOne({ name: "Lab 1" });
        await Pc.deleteOne({ deadStockNo: "CSE/PC/2021/045" });

        const department = await Dept.create({
            name: "Computer Science",
            code: "CSE"
        });
        console.log("Department created:", department._id);

        const lab = await Lab.create({
            name: "Lab 1",
            department: department._id
        });
        console.log("Lab created:", lab._id);

        const pc = await Pc.create({
            deadStockNo: "CSE/PC/2021/045",
            department: department._id,
            lab: lab._id,
            warranty: {
                status: "Active",
                expiryDate: new Date("2027-01-01")
            },
            purchaseDate: new Date("2021-06-15")
        });
        console.log("PC created:", pc._id);
        console.log("\nUse this deadStockNo for testing sync/Postman:", pc.deadStockNo);

        process.exit(0);
    } catch (err) {
        console.error("Seeding failed:", err);
        process.exit(1);
    }
};

seed();