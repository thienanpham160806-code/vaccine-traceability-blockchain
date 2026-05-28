import { NextFunction, Request, Response } from 'express';
import { ZodSchema } from 'zod';

type ValidationSchemas = {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
};

function formatIssues(error: any) {
  return error.issues?.map((issue: any) => ({
    path: issue.path.join('.'),
    message: issue.message,
  })) || [];
}

export function validateRequest(schemas: ValidationSchemas) {
  return (req: Request, res: Response, next: NextFunction) => {
    const bodyResult = schemas.body?.safeParse(req.body);
    if (bodyResult && !bodyResult.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request body validation failed',
          details: formatIssues(bodyResult.error),
        },
        timestamp: Date.now(),
      });
    }

    const queryResult = schemas.query?.safeParse(req.query);
    if (queryResult && !queryResult.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request query validation failed',
          details: formatIssues(queryResult.error),
        },
        timestamp: Date.now(),
      });
    }

    const paramsResult = schemas.params?.safeParse(req.params);
    if (paramsResult && !paramsResult.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request params validation failed',
          details: formatIssues(paramsResult.error),
        },
        timestamp: Date.now(),
      });
    }

    if (bodyResult?.success) req.body = bodyResult.data;
    if (queryResult?.success) req.query = queryResult.data as any;
    if (paramsResult?.success) req.params = paramsResult.data as any;

    next();
  };
}
