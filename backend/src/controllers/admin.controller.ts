import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import {
  getSummary,
  createHod,
  listHods,
  toggleHodActive,
  deleteHod,
} from "../services/admin.service.js";
import type { CreateHodInput, ToggleActiveInput } from "../validators/admin.validator.js";

const summary = asyncHandler(async (_req, res) => {
  const data = await getSummary();

  res.status(200).json(new ApiResponse(200, data, "Admin summary fetched"));
});

const createStaff = asyncHandler<Record<string, string>, unknown, CreateHodInput>(
  async (req, res) => {
    const user = await createHod(req.body);

    res
      .status(201)
      .json(
        new ApiResponse(
          201,
          user,
          "HOD account created successfully and credentials sent via email",
        ),
      );
  },
);

const getStaff = asyncHandler(async (_req, res) => {
  const staff = await listHods();

  res.status(200).json(new ApiResponse(200, staff, "HOD staff fetched successfully"));
});

const toggleStaffActive = asyncHandler<{ id: string }, unknown, ToggleActiveInput>(
  async (req, res) => {
    const { id } = req.params;
    const { isActive } = req.body;
    const updated = await toggleHodActive(id, isActive);

    res
      .status(200)
      .json(
        new ApiResponse(
          200,
          updated,
          `HOD account ${isActive ? "activated" : "deactivated"} successfully`,
        ),
      );
  },
);

const deleteStaff = asyncHandler<{ id: string }>(async (req, res) => {
  const { id } = req.params;
  await deleteHod(id);

  res
    .status(200)
    .json(new ApiResponse(200, null, "HOD account deleted successfully from the system"));
});

export { summary, createStaff, getStaff, toggleStaffActive, deleteStaff };