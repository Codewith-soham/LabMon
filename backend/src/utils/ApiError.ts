// Provides a consistent error shape for the API response.

export interface ApiFieldError {
  field: string;
  message: string;
}

export type ApiErrorDetail = ApiFieldError | string;

class ApiError extends Error {
  public readonly statusCode: number;
  public readonly data: null;
  public readonly success: false;
  public readonly errors: ApiErrorDetail[];

  constructor(
    statusCode: number,
    message = "Something went wrong",
    errors: ApiErrorDetail[] = [],
    stack = "", // to understand where the error is coming from
  ) {
    super(message); // from the Error class
    this.statusCode = statusCode;
    this.message = message;
    this.data = null;
    this.success = false;
    this.errors = errors;

    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor); // fresh stack trace
    }
  }
}

export { ApiError };
