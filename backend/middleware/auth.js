const jwt = require('jsonwebtoken');
const Session = require('../models/Session');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'secureid-dev-secret';

/**
 * Server-side Session Authentication Middleware.
 * Validates the `sessionId` cookie (or `x-session-id` header).
 * Looks up session in MongoDB and verifies expiration.
 */
async function sessionAuthMiddleware(req, res, next) {
  const sessionId = req.cookies?.sessionId || req.headers['x-session-id'];

  if (!sessionId) {
    return res.status(401).json({
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Authentication required. Please log in.',
    });
  }

  try {
    const session = await Session.findOne({
      sessionId,
      expiresAt: { $gt: new Date() },
    });

    if (!session) {
      return res.status(401).json({
        success: false,
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired session. Please log in.',
      });
    }

    const user = await User.findById(session.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        code: 'UNAUTHORIZED',
        message: 'User not found.',
      });
    }

    req.session = session;
    req.user = user;
    req.userId = user._id;
    next();
  } catch (error) {
    console.error('Session auth error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Authentication error.',
    });
  }
}

/**
 * JWT Authentication Middleware (Bearer <token>).
 * Validates JWT signature and expiration.
 */
function jwtAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Authentication token required.',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    req.userEmail = decoded.email;
    req.userName = decoded.name;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        code: 'TOKEN_EXPIRED',
        message: 'Token has expired.',
      });
    }

    return res.status(401).json({
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Invalid authentication token.',
    });
  }
}

/**
 * Flexible Auth Middleware (supports either Session Cookie or Bearer JWT).
 */
async function authMiddleware(req, res, next) {
  // Check session cookie first
  const sessionId = req.cookies?.sessionId || req.headers['x-session-id'];
  if (sessionId) {
    try {
      const session = await Session.findOne({
        sessionId,
        expiresAt: { $gt: new Date() },
      });
      if (session) {
        const user = await User.findById(session.userId);
        if (user) {
          req.session = session;
          req.user = user;
          req.userId = user._id;
          return next();
        }
      }
    } catch (e) {
      // Fall through to JWT check
    }
  }

  // Check Bearer JWT token
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.userId = decoded.userId;
      req.userEmail = decoded.email;
      req.userName = decoded.name;
      return next();
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          code: 'TOKEN_EXPIRED',
          message: 'Token has expired. Please log in again.',
        });
      }
      return res.status(401).json({
        success: false,
        code: 'UNAUTHORIZED',
        message: 'Invalid authentication token.',
      });
    }
  }

  return res.status(401).json({
    success: false,
    code: 'UNAUTHORIZED',
    message: 'Authentication required. Please log in.',
  });
}

module.exports = {
  authMiddleware,
  sessionAuthMiddleware,
  jwtAuthMiddleware,
};
