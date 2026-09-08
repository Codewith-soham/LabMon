// Generic Zod request-validation middleware. Schemas here check shape/type
// only - existing service-layer semantic checks (invalid enum values,
// "already verified", etc.) are left in place and still run afterwards.

import type { Request, RequestHandler } from "express";
import type { ZodType } from "zod";
import { ApiError } from "../utils/ApiError.js";

type ValidationTarget = "body" | "params" | "query";

const validate =
  (schema: ZodType, target: ValidationTarget = "body"): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req[target]);

    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));
      throw new ApiError(400, "Validation failed", errors);
    }

    // `req.query` is a getter with no setter in Express 5, so assign through a
    // cast to the mutable shape; body/params assign normally.
    (req as Request & Record<ValidationTarget, unknown>)[target] = result.data;
    next();
  };

export { validate };
