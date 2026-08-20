import { listDepartments } from "../services/dept.service.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiResponse } from "../utils/ApiResponse.js"

const getDepartments = asyncHandler(async (req, res) => {
    const departments = await listDepartments()

    return res.status(200).json(new ApiResponse(200, departments, "Departments fetched successfully"))
})

export { getDepartments }
