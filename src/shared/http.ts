import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { HttpError } from './errors';

export const numberParamSchema = z.coerce.number().int().positive();

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(10)
});

export const parseIdParam = (req: Request, res: Response, label: string) => {
  const id = numberParamSchema.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: `รหัส${label}ไม่ถูกต้อง` });
    return undefined;
  }

  return id.data;
};

export const errorMessage = (error: unknown, fallback = 'เกิดข้อผิดพลาด') => {
  return error instanceof Error ? error.message : fallback;
};

export const getHttpErrorStatus = (error: unknown) => {
  if (error instanceof HttpError) {
    return error.statusCode;
  }

  if (error instanceof SyntaxError && 'body' in error) {
    return 400;
  }

  return 500;
};

export const sendHttpError = (res: Response, error: unknown) => {
  const status = getHttpErrorStatus(error);
  const syntaxErrorMessage = error instanceof SyntaxError && 'body' in error
    ? 'ข้อมูล JSON ไม่ถูกต้อง'
    : undefined;
  const message = error instanceof HttpError
    ? error.message
    : syntaxErrorMessage
      ? syntaxErrorMessage
    : status === 500
      ? 'เกิดข้อผิดพลาดภายในระบบ'
      : errorMessage(error, 'คำขอล้มเหลว');
  return res.status(status).json({ error: message });
};

export const fallbackErrorHandler = (
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  if (res.headersSent) {
    return;
  }

  if (getHttpErrorStatus(error) === 500) {
    console.error(error);
  }

  return sendHttpError(res, error);
};
