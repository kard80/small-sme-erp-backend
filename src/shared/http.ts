import { Request, Response } from 'express';
import { z } from 'zod';

export const numberParamSchema = z.coerce.number().int().positive();

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(10)
});

export const parseIdParam = (req: Request, res: Response, label: string) => {
  const id = numberParamSchema.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: `Invalid ${label} id` });
    return undefined;
  }

  return id.data;
};

export const errorMessage = (error: unknown, fallback = 'Unknown error') => {
  return error instanceof Error ? error.message : fallback;
};
