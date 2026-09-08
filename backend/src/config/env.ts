// Typed, validated view of process.env. Every other module imports `env` from
// here instead of reaching into process.env, so a missing/malformed required
// variable fails loudly at startup rather than surfacing as a runtime crash
// deep in a request handler.
//
// Note: this module only *reads* process.env. Loading the .env file is still the
// entry point's job (`import "dotenv/config"` in server.ts; `dotenv.config()` in
// the test files), matching the previous behavior exactly.

import { z } from "zod";

const booleanish = z.enum(["true", "false"]).transform((value) => value === "true");

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),

  PORT: z.coerce.number().int().positive().default(8000),
  MONGO_URL: z.string().min(1, "MONGO_URL is required"),
  CORS_ORIGIN: z.string().min(1).default("http://localhost:5173"),

  JWT_ACCESS_TOKEN: z.string().min(1, "JWT_ACCESS_TOKEN is required"),
  JWT_ACCESS_EXPIRY: z.string().min(1, "JWT_ACCESS_EXPIRY is required"),
  JWT_REFRESH_TOKEN: z.string().min(1, "JWT_REFRESH_TOKEN is required"),
  JWT_REFRESH_EXPIRY: z.string().min(1, "JWT_REFRESH_EXPIRY is required"),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_SECURE: booleanish.optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().optional(),

  OTP_EXPIRY_MINUTES: z.coerce.number().int().positive().optional(),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().optional(),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().nonnegative().optional(),

  RATE_LIMIT_LOGIN_WINDOW_MS: z.coerce.number().int().positive().optional(),
  RATE_LIMIT_LOGIN_MAX: z.coerce.number().int().positive().optional(),
  RATE_LIMIT_OTP_VERIFY_WINDOW_MS: z.coerce.number().int().positive().optional(),
  RATE_LIMIT_OTP_VERIFY_MAX: z.coerce.number().int().positive().optional(),
  RATE_LIMIT_OTP_RESEND_WINDOW_MS: z.coerce.number().int().positive().optional(),
  RATE_LIMIT_OTP_RESEND_MAX: z.coerce.number().int().positive().optional(),
  RATE_LIMIT_COMPLAINT_WINDOW_MS: z.coerce.number().int().positive().optional(),
  RATE_LIMIT_COMPLAINT_MAX: z.coerce.number().int().positive().optional(),
  RATE_LIMIT_PC_SYNC_WINDOW_MS: z.coerce.number().int().positive().optional(),
  RATE_LIMIT_PC_SYNC_MAX: z.coerce.number().int().positive().optional(),
});

export type Env = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
  throw new Error(`Invalid environment configuration:\n${details}`);
}

export const env: Env = parsed.data;

export const isTestEnv = env.NODE_ENV === "test";
export const isProduction = env.NODE_ENV === "production";
