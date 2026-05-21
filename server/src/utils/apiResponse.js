export const successResponse = (res, data = {}, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    data,
    message,
  });
};

export const errorResponse = (res, code, message, statusCode = 500, details = undefined) => {
  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      ...(details && typeof details === 'object' ? details : {}),
    },
  });
};
