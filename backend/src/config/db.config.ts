import dns from "node:dns";
import mongoose from "mongoose";
import { env } from "./env.js";

// Many residential ISP/router DNS servers refuse or drop SRV queries used by mongodb+srv://
// URLs, throwing querySrv ECONNREFUSED. Using Google/Cloudflare DNS fixes this reliably.
try {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch {
  // Ignore if custom DNS cannot be set in specific environments
}

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
