import { z } from "zod";

export const objectIdParamSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid id"),
});

export type ObjectIdParam = z.infer<typeof objectIdParamSchema>;
