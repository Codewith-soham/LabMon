// Generic Zod request-validation middleware. Schemas here check shape/type
// only - existing service-layer semantic checks (invalid enum values,
// "already verified", etc.) are left in place and still run afterwards.

import { ApiError } from "../utils/ApiError.js";

const validate =
  (schema, target = "body") =>
  (req, res, next) => {
    const result = schema.safeParse(req[target]);

    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));
      throw new ApiError(400, "Validation failed", errors);
    }

    req[target] = result.data;
    next();
  };

export { validate };
