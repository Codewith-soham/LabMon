import { z } from "zod";

export const createHodSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().toLowerCase().email("Please provide a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  department: z.string().trim().min(1, "Department is required"),
});

export const toggleActiveSchema = z.object({
  isActive: z.boolean({ required_error: "isActive is required" }),
});

export type CreateHodInput = z.infer<typeof createHodSchema>;
export type ToggleActiveInput = z.infer<typeof toggleActiveSchema>;
