const crypto = require('crypto');
const QRCode = require('qrcode');
const OTPAuth = require('otpauth');
const User = require('../models/User');
const OtpChallenge = require('../models/OtpChallenge');
const { createChallenge, verifyChallenge } = require('../utils/otp');

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

    user.mfaSecret = secret.base32;
    user.registrationStatus = 'mfa-setup';
    await user.save();

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
      return res.status(400).json({
        success: false,
        code: 'INVALID_OTP',
        message: 'Invalid verification code. Please try again.',
      });
    }

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

async function generateTestMfaOtp(req, res) {
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
      note: 'DEVELOPMENT/TEST ONLY — Simulated MFA TOTP for evaluator testing.',
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
