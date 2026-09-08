import { listDepartments } from "../services/dept.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";

const getDepartments = asyncHandler(async (_req, res) => {
  const departments = await listDepartments();

  res.status(200).json(new ApiResponse(200, departments, "Departments fetched successfully"));
});

export { getDepartments };
