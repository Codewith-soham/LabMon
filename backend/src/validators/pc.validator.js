import { z } from "zod";

const syncPcSchema = z.object({
  deadStockNo: z.string().trim().min(1),
  department: z.string().trim().min(1).optional(),
  lab: z.string().trim().min(1).optional(),
  config: z.record(z.string(), z.any()).optional(),
});

export { syncPcSchema };
