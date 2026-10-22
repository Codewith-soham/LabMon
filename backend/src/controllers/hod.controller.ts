import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import {
  createLabIncharge,
  listLabIncharges,
  toggleLabInchargeActive,
  deleteLabIncharge,
} from "../services/hod.service.js";
import type {
  CreateLabInchargeInput,
  HodToggleActiveInput,
} from "../validators/hod.validator.js";

const createStaff = asyncHandler<Record<string, string>, unknown, CreateLabInchargeInput>(
  async (req, res) => {
    const hodDepartmentId = req.user?.department;
    if (!hodDepartmentId) {
      throw new ApiError(400, "Logged-in HOD does not have an assigned department");
    }

    const { name, email, password } = req.body;
    const user = await createLabIncharge({
      name,
      email,
      password,
      hodDepartmentId,
    });

    res
      .status(201)
      .json(
        new ApiResponse(
          201,
          user,
          "Lab Incharge account created successfully and credentials sent via email",
        ),
      );
  },
);

const getStaff = asyncHandler(async (req, res) => {
  const hodDepartmentId = req.user?.department;
  if (!hodDepartmentId) {
    throw new ApiError(400, "Logged-in HOD does not have an assigned department");
  }

  const staff = await listLabIncharges(hodDepartmentId);

  res
    .status(200)
    .json(new ApiResponse(200, staff, "Lab Incharges fetched successfully"));
});

const toggleStaffActive = asyncHandler<{ id: string }, unknown, HodToggleActiveInput>(
  async (req, res) => {
    const hodDepartmentId = req.user?.department;
    if (!hodDepartmentId) {
      throw new ApiError(400, "Logged-in HOD does not have an assigned department");
    }

    const { id } = req.params;
    const { isActive } = req.body;
    const updated = await toggleLabInchargeActive(id, isActive, hodDepartmentId);

    res
      .status(200)
      .json(
        new ApiResponse(
          200,
          updated,
          `Lab Incharge account ${isActive ? "activated" : "deactivated"} successfully`,
        ),
      );
  },
);

const deleteStaff = asyncHandler<{ id: string }>(async (req, res) => {
  const hodDepartmentId = req.user?.department;
  if (!hodDepartmentId) {
    throw new ApiError(400, "Logged-in HOD does not have an assigned department");
  }

  const { id } = req.params;
  await deleteLabIncharge(id, hodDepartmentId);

  res
    .status(200)
    .json(
      new ApiResponse(200, null, "Lab Incharge account deleted successfully from the system"),
    );
});

export { createStaff, getStaff, toggleStaffActive, deleteStaff };
