import { z } from "zod";

const raiseComplaintSchema = z.object({
  deadStockNo: z.string().trim().min(1),
  description: z.string().trim().min(1).max(2000),
  raisedBy: z.object({
    name: z.string().trim().min(1),
    contact: z.string().trim().min(1),
  }),
});

const resolveComplaintSchema = z.object({
  remarks: z.string().trim().max(2000).optional(),
});

export { raiseComplaintSchema, resolveComplaintSchema };
