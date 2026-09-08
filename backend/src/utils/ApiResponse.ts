// Used to give consistent API responses.

class ApiResponse<T = unknown> {
  public readonly statusCode: number;
  public readonly data: T;
  public readonly message: string;
  public readonly success: boolean;

  constructor(statusCode: number, data: T, message = "Success") {
    this.statusCode = statusCode;
    this.data = data;
    this.message = message;
    this.success = statusCode < 400; // 400 and above is an error
  }
}

export { ApiResponse };
