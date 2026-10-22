import { z } from "zod";

export const createLabInchargeSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().toLowerCase().email("Please provide a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
});

export const hodToggleActiveSchema = z.object({
  isActive: z.boolean({ required_error: "isActive is required" }),
});

export type CreateLabInchargeInput = z.infer<typeof createLabInchargeSchema>;
export type HodToggleActiveInput = z.infer<typeof hodToggleActiveSchema>;
