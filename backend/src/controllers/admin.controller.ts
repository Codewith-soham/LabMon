import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { getSummary } from "../services/admin.service.js";

const summary = asyncHandler(async (_req, res) => {
  const data = await getSummary();

  res.status(200).json(new ApiResponse(200, data, "Admin summary fetched"));
});

export { summary };
