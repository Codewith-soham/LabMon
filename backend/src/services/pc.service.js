import { Pc } from "../models/pc.model.js"
import { ApiError } from "../utils/ApiError.js"

const syncPcConfig = async (payload) => {
  const { deadStockNo, config } = payload

  if (!deadStockNo) {
    throw new ApiError(400, "deadStockNo is required")
  }

  const pc = await Pc.findOneAndUpdate(
    { deadStockNo },
    {
      $set: {
        config: {
          ...config,
          lastSyncedAt: new Date(),
        },
      },
    },
    { returnDocument: "after" },
  )

  if (!pc) {
    throw new ApiError(404, "PC not found. Check dead stock number.")
  }

  return pc
}

export { syncPcConfig }