//provides consistent error shape for api response

class ApiError extends Error {
  constructor(
    statusCode,
    message = "Something went wrong",
    errors = [],
    stack = "", //to understand from where the error is comming
  ) {
    super(message); //from error class
    this.statusCode = statusCode;
    this.message = message;
    this.data = null;
    this.success = false;
    this.errors = errors;

    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor); //creates a new stack trace (stack - history of function call)
    }
  }
}

export { ApiError };
