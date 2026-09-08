import "dotenv/config";
import { app } from "./app.js";
import connectDB from "./config/db.config.js";
import { env } from "./config/env.js";

const PORT = env.PORT;

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server connected to ${PORT}`);
    });
  })
  .catch(() => {
    console.error("Failed to connect database");
  });
