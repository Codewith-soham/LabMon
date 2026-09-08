import {
  syncPcConfig,
  getPcHealthCard,
  searchPcs,
  lookupPcByDeadStockNo,
} from "../services/pc.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import type { SyncPcInput } from "../validators/pc.validator.js";

const syncPc = asyncHandler<Record<string, string>, unknown, SyncPcInput>(async (req, res) => {
  const pc = await syncPcConfig(req.body);

  res.status(200).json(new ApiResponse(200, pc, "PC config updated"));
});

const PcHealthCard = asyncHandler<{ id: string }>(async (req, res) => {
  const pc = await getPcHealthCard(req.params.id, req.scope ?? {});

  res.status(200).json(new ApiResponse(200, pc, "PC health card fetched"));
});

const searchPc = asyncHandler(async (req, res) => {
  const pcs = await searchPcs(req.query, req.scope ?? {});

  res.status(200).json(new ApiResponse(200, pcs, "PC search results fetched"));
});

const lookupPc = asyncHandler<{ deadStockNo: string }>(async (req, res) => {
  const pc = await lookupPcByDeadStockNo(req.params.deadStockNo);

  res.status(200).json(new ApiResponse(200, pc, "PC found"));
});

export { syncPc, PcHealthCard, searchPc, lookupPc };
