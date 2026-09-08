import mongoose from "mongoose";
import { env } from "./env.js";

const connectDB = async (): Promise<void> => {
  try {
    await mongoose.connect(env.MONGO_URL);
    console.log("Database connected successfully");
  } catch (error) {
    console.error("Database connection failed", error);
    process.exit(1);
  }
};

export default connectDB;
