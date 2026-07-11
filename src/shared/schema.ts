import z from "zod";

export const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/);

export const monthSchema = z.string().regex(/^\d{4}-\d{2}/, 'Invalid date format, expected YYYY-MM');