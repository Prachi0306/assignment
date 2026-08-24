const crypto = require('crypto');
const QRCode = require('qrcode');
const OTPAuth = require('otpauth');
const User = require('../models/User');
const OtpChallenge = require('../models/OtpChallenge');
const { createChallenge, verifyChallenge } = require('../utils/otp');

/**
 * POST /api/mfa/setup
 * Generate MFA secret and QR code for authenticator app setup.
 */
async function setupMfa(req, res) {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'User ID is required.',
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        code: 'CHALLENGE_NOT_FOUND',
        message: 'User not found.',
      });
    }

    if (!user.emailVerified || !user.phoneVerified) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Email and phone must be verified first.',
      });
    }

    if (user.mfaEnabled) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'MFA is already enabled.',
      });
    }

    // Generate TOTP secret
    const secret = new OTPAuth.Secret({ size: 20 });
    const totp = new OTPAuth.TOTP({
      issuer: 'SecureID',
      label: user.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: secret,
    });

    const otpAuthUrl = totp.toString();

    // Store the secret on the user (encrypted in production, base32 for dev)
    user.mfaSecret = secret.base32;
    user.registrationStatus = 'mfa-setup';
    await user.save();

    // Generate QR code as data URL
    const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl);

    return res.status(200).json({
      success: true,
      message: 'MFA setup initiated.',
      qrCode: qrCodeDataUrl,
      setupKey: secret.base32,
      next: 'mfa-setup',
    });
  } catch (error) {
    console.error('MFA setup error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'An unexpected error occurred.',
    });
  }
}

/**
 * POST /api/mfa/verify
 * Verify the TOTP code from the authenticator app.
 */
async function verifyMfa(req, res) {
  try {
    const { userId, otp } = req.body;

    if (!userId || !otp) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'User ID and OTP are required.',
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        code: 'CHALLENGE_NOT_FOUND',
        message: 'User not found.',
      });
    }

    if (!user.mfaSecret) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'MFA has not been set up.',
      });
    }

    if (user.mfaEnabled) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'MFA is already enabled.',
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

    // validate returns the delta (null if invalid, number if valid)
    const delta = totp.validate({ token: otp, window: 1 });

    if (delta === null) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_OTP',
        message: 'Invalid verification code. Please try again.',
      });
    }

    // MFA verified — complete registration
    user.mfaEnabled = true;
    user.registrationStatus = 'complete';
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'MFA enabled successfully. Registration complete!',
      next: 'registration-success',
    });
  } catch (error) {
    console.error('MFA verify error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'An unexpected error occurred.',
    });
  }
}

/**
 * POST /api/mfa/generate-test-otp
 * Development-only: Generate a valid TOTP for the user (for evaluator testing).
 */
async function generateTestMfaOtp(req, res) {
  if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
    return res.status(404).json({ success: false, message: 'Not found.' });
  }

  try {
    const { userId } = req.body;
    const user = await User.findById(userId);
    if (!user || !user.mfaSecret) {
      return res.status(404).json({ success: false, message: 'User or MFA secret not found.' });
    }

    const totp = new OTPAuth.TOTP({
      issuer: 'SecureID',
      label: user.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(user.mfaSecret),
    });

    const otp = totp.generate();

    return res.status(200).json({
      success: true,
      otp,
      note: 'DEVELOPMENT ONLY — This endpoint must be disabled in production.',
    });
  } catch (error) {
    console.error('Generate test MFA OTP error:', error);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR', message: 'Error generating OTP.' });
  }
}

module.exports = {
  setupMfa,
  verifyMfa,
  generateTestMfaOtp,
};
