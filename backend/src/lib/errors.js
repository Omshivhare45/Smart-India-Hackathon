export class APIError extends Error {
  constructor(code, message, status = 500) {
    super(message);
    this.name = 'APIError';
    this.code = code;
    this.status = status;
  }
}

export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `No endpoint matches ${req.method} ${req.originalUrl}` },
  });
}

export function errorHandler(err, req, res, _next) {
  if (err instanceof APIError) {
    return res.status(err.status).json({
      success: false,
      error: { code: err.code, message: err.message },
    });
  }
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: err && err.message ? err.message : 'Unexpected server error',
    },
  });
}