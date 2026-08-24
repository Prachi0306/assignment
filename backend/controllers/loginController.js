const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const OTPAuth = require('otpauth');
const User = require('../models/User');
const Session = require('../models/Session');

// Enforce JWT_SECRET in production — never fall back to an insecure default
const JWT_SECRET = (() => {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: JWT_SECRET environment variable is required in production.');
  }
  console.warn('⚠️  WARNING: Using default JWT secret. Set JWT_SECRET in production!');
  return 'secureid-dev-secret';
})();
const JWT_EXPIRY = process.env.JWT_EXPIRY || '15m'; // Short-lived JWT

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Generate a short-lived JWT token for an authenticated user.
 */
function generateToken(user) {
  return jwt.sign(
    {
      userId: user._id,
      email: user.email,
      name: user.name,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

/**
 * Helper to create a server-side session and set an httpOnly cookie.
 */
async function createServerSession(user, res) {
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  await Session.create({
    sessionId,
    userId: user._id,
    expiresAt,
  });

  // Set secure, httpOnly authentication cookie
  // Secure cookie configuration
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie('sessionId', sessionId, {
    httpOnly: true,
    sameSite: process.env.COOKIE_SAME_SITE || 'lax',
    secure: isProduction,
    maxAge: 24 * 60 * 60 * 1000,
    path: '/',
  });

  return sessionId;
}

/**
 * POST /api/login
 * Validates credentials, checks lockout, and requests MFA if enabled.
 */
async function login(req, res) {
  try {
    const { email, password } = req.body;

    // Validate inputs
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Email and password are required.',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      // Prevent account enumeration
      return res.status(401).json({
        success: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      });
    }

    // Check account lockout
    if (user.lockUntil && user.lockUntil > new Date()) {
      const remainingMinutes = Math.ceil((user.lockUntil - Date.now()) / (60 * 1000));
      return res.status(401).json({
        success: false,
        code: 'ACCOUNT_LOCKED',
        message: `Account is temporarily locked due to multiple failed login attempts. Please try again in ${remainingMinutes} minute(s).`,
      });
    }

    // Check registration status
    if (user.registrationStatus !== 'complete') {
      return res.status(401).json({
        success: false,
        code: 'REGISTRATION_INCOMPLETE',
        message: 'Please complete your registration first.',
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      // Increment failed attempts
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      if (user.failedLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
        user.lockUntil = new Date(Date.now() + LOCK_TIME_MS);
      }
      await user.save();

      if (user.failedLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
        return res.status(401).json({
          success: false,
          code: 'ACCOUNT_LOCKED',
          message: 'Account is temporarily locked due to multiple failed login attempts. Please try again in 15 minutes.',
        });
      }

      return res.status(401).json({
        success: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      });
    }

    // Credentials valid — reset lockout counters if no MFA is needed
    if (!user.mfaEnabled || !user.mfaSecret) {
      user.failedLoginAttempts = 0;
      user.lockUntil = null;
      await user.save();

      // Create server-side session + cookie
      const sessionId = await createServerSession(user, res);
      const token = generateToken(user);

      return res.status(200).json({
        success: true,
        message: 'Login successful.',
        sessionId,
        token,
        next: 'dashboard',
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
        },
      });
    }

    // MFA required — do not issue session or token yet
    return res.status(200).json({
      success: true,
      message: 'Password verified. MFA verification required.',
      mfaRequired: true,
      userId: user._id,
      next: 'mfa-verify',
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'An unexpected error occurred.',
    });
  }
}

/**
 * POST /api/verify-login-otp (or /api/login/verify-mfa)
 * Verifies TOTP MFA during login, establishes server-side session & sets cookie.
 */
async function loginVerifyMfa(req, res) {
  try {
    const { userId, otp } = req.body;

    if (!userId || !otp) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'User ID and verification code are required.',
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid credentials.',
      });
    }

    if (!user.mfaSecret) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'MFA is not configured for this account.',
      });
    }

    // Check account lockout
    if (user.lockUntil && user.lockUntil > new Date()) {
      return res.status(401).json({
        success: false,
        code: 'ACCOUNT_LOCKED',
        message: 'Account is temporarily locked due to multiple failed login attempts.',
      });
    }

    // Verify TOTP
    const totp = new OTPAuth.TOTP({
      issuer: 'SecureID',
      label: user.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(user.mfaSecret),
    });

    const delta = totp.validate({ token: otp, window: 1 });

    if (delta === null) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      if (user.failedLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
        user.lockUntil = new Date(Date.now() + LOCK_TIME_MS);
      }
      await user.save();

      return res.status(401).json({
        success: false,
        code: 'INVALID_OTP',
        message: 'Invalid verification code. Please try again.',
      });
    }

    // Reset login attempt counters upon full authentication
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    await user.save();

    // 1. Create true SERVER-SIDE SESSION + Set HttpOnly Authentication Cookie
    const sessionId = await createServerSession(user, res);

    // 2. Issue short-lived JWT token
    const token = generateToken(user);

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      sessionId,
      token,
      next: 'dashboard',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error('Login MFA verify error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'An unexpected error occurred.',
    });
  }
}

/**
 * GET /api/me
 * Returns current authenticated user profile using server-side session cookie.
 */
async function getMe(req, res) {
  try {
    const user = req.user || (await User.findById(req.userId));
    if (!user) {
      return res.status(401).json({
        success: false,
        code: 'UNAUTHORIZED',
        message: 'Not authenticated.',
      });
    }

    return res.status(200).json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified,
        mfaEnabled: user.mfaEnabled,
        registrationStatus: user.registrationStatus,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error('Get /api/me error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Server error.',
    });
  }
}

/**
 * POST /api/logout
 * Destroys server-side session from database and clears auth cookie.
 */
async function logout(req, res) {
  try {
    const sessionId = req.cookies?.sessionId || req.headers['x-session-id'] || req.session?.sessionId;

    if (sessionId) {
      await Session.deleteOne({ sessionId });
    }

    // Clear httpOnly cookie
    res.clearCookie('sessionId', {
      httpOnly: true,
      sameSite: process.env.COOKIE_SAME_SITE || 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });

    return res.status(200).json({
      success: true,
      message: 'Logged out successfully.',
    });
  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Logout failed.',
    });
  }
}

/**
 * POST /api/token
 * Issues a short-lived JWT token for an authenticated user (via session or credentials).
 */
async function issueToken(req, res) {
  try {
    let user = null;

    // Check if user is already authenticated via session
    const sessionId = req.cookies?.sessionId || req.headers['x-session-id'];
    if (sessionId) {
      const session = await Session.findOne({
        sessionId,
        expiresAt: { $gt: new Date() },
      });
      if (session) {
        user = await User.findById(session.userId);
      }
    }

    // Alternatively accept credentials { email, password }
    if (!user && req.body.email && req.body.password) {
      const candidateUser = await User.findOne({ email: req.body.email.toLowerCase().trim() });
      if (candidateUser && (await bcrypt.compare(req.body.password, candidateUser.passwordHash))) {
        if (!candidateUser.mfaEnabled) {
          user = candidateUser;
        }
      }
    }

    // If still not authenticated
    if (!user) {
      return res.status(401).json({
        success: false,
        code: 'UNAUTHORIZED',
        message: 'Authentication required to issue token.',
      });
    }

    const token = generateToken(user);

    return res.status(200).json({
      success: true,
      token,
      tokenType: 'Bearer',
      expiresIn: 900, // 15 minutes
    });
  } catch (error) {
    console.error('Issue token error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Unable to issue token.',
    });
  }
}

/**
 * GET /api/protected
 * JWT-only protected route (requires Authorization: Bearer <token>).
 */
async function getProtected(req, res) {
  return res.status(200).json({
    success: true,
    message: 'Access granted to protected resource.',
    user: {
      id: req.userId,
      email: req.userEmail,
      name: req.userName,
    },
  });
}

/**
 * GET /api/dashboard
 * User profile dashboard (supports either session cookie or Bearer JWT).
 */
async function getDashboard(req, res) {
  return getMe(req, res);
}

module.exports = {
  login,
  loginVerifyMfa,
  getMe,
  logout,
  issueToken,
  getProtected,
  getDashboard,
};
