import mongoose from "mongoose"
import { Pc } from "../models/pc.model.js"
import { ApiError } from "../utils/ApiError.js"

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const syncPcConfig = async (payload) => {
  const { deadStockNo, config } = payload

  if (!deadStockNo) {
    throw new ApiError(400, "deadStockNo is required")
  }

  const configSet = {}
  for (const [key, value] of Object.entries(config || {})) {
    if (value !== undefined) {
      configSet[`config.${key}`] = value
    }
  }
  configSet["config.lastSyncedAt"] = new Date()

  const pc = await Pc.findOneAndUpdate(
    { deadStockNo },
    { $set: configSet },
    { returnDocument: "after" },
  )

  if (!pc) {
    throw new ApiError(404, "PC not found. Check dead stock number.")
  }

  return pc
}

const getPcHealthCard = async(pcId , scope) => {
  if (!mongoose.Types.ObjectId.isValid(pcId)) {
    throw new ApiError(400, "Invalid PC id")
  }

  const pc = await Pc.findOne({_id: pcId, ...scope})

  if(!pc){
    throw new ApiError(404, "Pc not found")
  }

  return pc
}

const searchPcs = async (queryParams, scope) => {
  const { deadStockNo, cpu, ram, disk, os, software, warrantyStatus, lab } = queryParams

  const filter = { ...scope }

  const addRegexFilter = (field, value) => {
    if (value && String(value).trim()) {
      filter[field] = { $regex: escapeRegex(String(value).trim()), $options: "i" }
    }
  }

  addRegexFilter("deadStockNo", deadStockNo)
  addRegexFilter("config.cpu", cpu)
  addRegexFilter("config.ram", ram)
  addRegexFilter("config.disk", disk)
  addRegexFilter("config.os", os)
  addRegexFilter("config.software", software)

  if (warrantyStatus) {
    if (!["Active", "Expired"].includes(warrantyStatus)) {
      throw new ApiError(400, "Invalid warrantyStatus. Must be 'Active' or 'Expired'")
    }
    filter["warranty.status"] = warrantyStatus
  }

  if (lab) {
    if (!mongoose.Types.ObjectId.isValid(lab)) {
      throw new ApiError(400, "Invalid lab id")
    }
    filter.lab = lab
  }

  return Pc.find(filter).sort({ createdAt: -1 })
}

export { syncPcConfig,
    getPcHealthCard,
    searchPcs
}