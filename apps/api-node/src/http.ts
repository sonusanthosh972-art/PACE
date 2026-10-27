import type { NextFunction, Request, Response } from 'express';
import { MongoServerError } from 'mongodb';
import type { ZodError } from 'zod';

/** RFC 7807 problem response (same shape the mobile client reads error messages from). */
export function problem(res: Response, status: number, title: string, detail?: string): void {
  res.status(status).json(detail ? { status, title, detail } : { status, title });
}

export function validationProblem(res: Response, error: ZodError): void {
  const flat = error.flatten();
  const errors: Record<string, string[]> = { ...flat.fieldErrors } as Record<string, string[]>;
  if (flat.formErrors.length > 0) errors.body = flat.formErrors;
  res.status(400).json({ status: 400, title: 'One or more validation errors occurred.', errors });
}

export function notFound(_req: Request, res: Response): void {
  problem(res, 404, 'Not found');
}

/** Last-resort handler: never leaks internals (Mongo errors can mention hosts). */
export function errorHandler(err: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(err);
    return;
  }
  if (err instanceof MongoServerError && err.code === 11000) {
    problem(res, 409, 'Conflict', 'The record already exists.');
    return;
  }
  if (err instanceof SyntaxError && 'body' in err) {
    problem(res, 400, 'Malformed JSON body');
    return;
  }
  if (typeof err === 'object' && err !== null && (err as { type?: string }).type === 'entity.too.large') {
    problem(res, 413, 'Payload too large');
    return;
  }
  console.error('[API] Unhandled error:', err instanceof Error ? `${err.name}: ${err.message}` : err);
  problem(res, 500, 'Internal server error');
}
