import type { ErrorRequestHandler } from "express";
import { ApiError } from "../utils/ApiError.js";

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      success: false,
      statusCode: err.statusCode,
      message: err.message,
      errors: err.errors,
    });
    return;
  }

  console.error(err);
  res.status(500).json({
    success: false,
    statusCode: 500,
    message: "Internal Server Error",
    errors: [],
  });
};

export { errorHandler };
