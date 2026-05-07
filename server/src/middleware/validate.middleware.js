import { AppError, errorCodes } from '../utils/AppError.js';

export const validate = (schema) => (req, _res, next) => {
  const result = schema.safeParse({
    body: req.body,
    params: req.params,
    query: req.query,
  });

  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    return next(new AppError(errorCodes.VALIDATION_ERROR, message, 400));
  }

  req.validated = result.data;
  return next();
};
