const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const OTPAuth = require('otpauth');
const User = require('../models/User');
const Session = require('../models/Session');

const JWT_SECRET = (() => {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: JWT_SECRET environment variable is required in production.');
  }
  console.warn('⚠️  WARNING: Using default JWT secret. Set JWT_SECRET in production!');
  return 'secureid-dev-secret';
})();
const JWT_EXPIRY = process.env.JWT_EXPIRY || '15m';

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME_MS = 15 * 60 * 1000;

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

async function createServerSession(user, res) {
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await Session.create({
    sessionId,
    userId: user._id,
    expiresAt,
  });

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

async function login(req, res) {
  try {
    const { email, password } = req.body;

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
      return res.status(401).json({
        success: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      });
    }

    if (user.lockUntil && user.lockUntil > new Date()) {
      const remainingMinutes = Math.ceil((user.lockUntil - Date.now()) / (60 * 1000));
      return res.status(401).json({
        success: false,
        code: 'ACCOUNT_LOCKED',
        message: `Account is temporarily locked due to multiple failed login attempts. Please try again in ${remainingMinutes} minute(s).`,
      });
    }

    if (user.registrationStatus !== 'complete') {
      return res.status(401).json({
        success: false,
        code: 'REGISTRATION_INCOMPLETE',
        message: 'Please complete your registration first.',
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
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

    if (!user.mfaEnabled || !user.mfaSecret) {
      user.failedLoginAttempts = 0;
      user.lockUntil = null;
      await user.save();

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

    if (user.lockUntil && user.lockUntil > new Date()) {
      return res.status(401).json({
        success: false,
        code: 'ACCOUNT_LOCKED',
        message: 'Account is temporarily locked due to multiple failed login attempts.',
      });
    }

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

    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    await user.save();

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
  } catch (error) {
    console.error('Login MFA verify error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'An unexpected error occurred.',
    });
  }
}

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

async function logout(req, res) {
  try {
    const sessionId = req.cookies?.sessionId || req.headers['x-session-id'] || req.session?.sessionId;

    if (sessionId) {
      await Session.deleteOne({ sessionId });
    }

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

async function issueToken(req, res) {
  try {
    let user = null;

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

    if (!user && req.body.email && req.body.password) {
      const candidateUser = await User.findOne({ email: req.body.email.toLowerCase().trim() });
      if (candidateUser && (await bcrypt.compare(req.body.password, candidateUser.passwordHash))) {
        if (!candidateUser.mfaEnabled) {
          user = candidateUser;
        }
      }
    }

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
      expiresIn: 900,
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
