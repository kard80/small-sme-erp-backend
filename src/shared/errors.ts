export class HttpError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class BadRequestError extends HttpError {
  constructor(message = 'คำขอไม่ถูกต้อง') {
    super(message, 400);
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = 'ไม่มีสิทธิ์เข้าถึง') {
    super(message, 401);
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'ไม่พบข้อมูล') {
    super(message, 404);
  }
}

export class InternalServerError extends HttpError {
  constructor(message = 'เกิดข้อผิดพลาดภายในระบบ') {
    super(message, 500);
  }
}
