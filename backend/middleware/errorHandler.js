/**
 * Global error handling middleware.
 */
function errorHandler(err, req, res, _next) {
  console.error('Unhandled error:', err);

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = {};
    for (const field of Object.keys(err.errors)) {
      errors[field] = err.errors[field].message;
    }
    return res.status(400).json({
      success: false,
      code: 'VALIDATION_ERROR',
      message: 'Validation failed.',
      errors,
    });
  }

  // Mongoose cast error (invalid ObjectId, etc.)
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      code: 'VALIDATION_ERROR',
      message: 'Invalid ID format.',
    });
  }

  // Default
  return res.status(500).json({
    success: false,
    code: 'SERVER_ERROR',
    message: 'An unexpected error occurred.',
  });
}

module.exports = errorHandler;
