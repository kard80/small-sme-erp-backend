import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  BadRequestError,
  ConflictError,
  InternalServerError,
  NotFoundError,
  UnauthorizedError
} from './errors';
import { formatZodError, getHttpErrorStatus, paginationSchema, sendHttpError } from './http';

describe('http errors', () => {
  it('maps typed errors to status codes', () => {
    expect(new BadRequestError().statusCode).toBe(400);
    expect(new UnauthorizedError().statusCode).toBe(401);
    expect(new NotFoundError().statusCode).toBe(404);
    expect(new ConflictError().statusCode).toBe(409);
    expect(new InternalServerError().statusCode).toBe(500);
  });

  it('getHttpErrorStatus handles HttpError, body-parse SyntaxError and unknown errors', () => {
    expect(getHttpErrorStatus(new NotFoundError())).toBe(404);
    expect(getHttpErrorStatus(Object.assign(new SyntaxError('x'), { body: '' }))).toBe(400);
    expect(getHttpErrorStatus(new Error('boom'))).toBe(500);
  });

  it('sendHttpError hides internal error messages', () => {
    const calls: Array<{ status: number; body: unknown }> = [];
    const res: any = {
      status(status: number) {
        return { json: (body: unknown) => calls.push({ status, body }) };
      }
    };

    sendHttpError(res, new Error('secret db detail'));
    sendHttpError(res, new ConflictError('dup'));

    expect(calls[0].status).toBe(500);
    expect(JSON.stringify(calls[0].body)).not.toContain('secret');
    expect(calls[1]).toEqual({ status: 409, body: { error: 'dup' } });
  });

  it('formatZodError keeps the first message per path', () => {
    const result = z.object({ a: z.string() }).safeParse({ a: 1 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(Object.keys(formatZodError(result.error))).toEqual(['a']);
    }
  });

  it('paginationSchema applies defaults and caps pageSize', () => {
    expect(paginationSchema.parse({})).toMatchObject({ page: 1, pageSize: 10 });
    expect(paginationSchema.safeParse({ pageSize: 501 }).success).toBe(false);
    expect(paginationSchema.safeParse({ page: 0 }).success).toBe(false);
  });
});

