const bcrypt = require('bcryptjs');
const User = require('../models/User');
const OtpChallenge = require('../models/OtpChallenge');
const { createChallenge, verifyChallenge } = require('../utils/otp');
const { validateRegistration } = require('../utils/validators');

/**
 * POST /api/register
 */
async function register(req, res) {
  try {
    const { name, email, phone, password, termsAccepted, privacyAccepted } = req.body;

    // 1. Validate registration data
    const validationErrors = validateRegistration({ name, email, phone, password, termsAccepted, privacyAccepted });
    if (validationErrors) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Please fix the following errors.',
        errors: validationErrors,
      });
    }

    // 2. Check if email already exists
    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        code: 'EMAIL_EXISTS',
        message: 'An account with this email already exists.',
      });
    }

    // 3. Hash the password
    const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // 4. Create the user
    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone.trim().replace(/[\s\-()]/g, ''),
      passwordHash,
      emailVerified: false,
      phoneVerified: false,
      mfaEnabled: false,
      registrationStatus: 'pending',
    });

    // 5. Generate email OTP challenge
    const { challengeId, otp } = await createChallenge(user._id, 'email');

    // 6. Simulated email delivery
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      console.log('\n========================================');
      console.log('[SIMULATED EMAIL]');
      console.log(`To: ${user.email}`);
      console.log(`OTP: ${otp}`);
      console.log('========================================\n');
    }

    // 7. Response
    return res.status(201).json({
      success: true,
      message: 'Registration started. Please verify your email.',
      challengeId,
      next: 'email-otp',
    });
  } catch (error) {
    console.error('Registration error:', error);

    // Handle duplicate key error (race condition)
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        code: 'EMAIL_EXISTS',
        message: 'An account with this email already exists.',
      });
    }

    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'An unexpected error occurred. Please try again.',
    });
  }
}

/**
 * POST /api/send-email-otp
 */
async function sendEmailOtp(req, res) {
  try {
    const { challengeId } = req.body;

    if (!challengeId) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Challenge ID is required.',
      });
    }

    // Find the existing challenge to get the userId
    const existingChallenge = await OtpChallenge.findOne({ challengeId });
    if (!existingChallenge) {
      return res.status(404).json({
        success: false,
        code: 'CHALLENGE_NOT_FOUND',
        message: 'Challenge not found.',
      });
    }

    const user = await User.findById(existingChallenge.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        code: 'CHALLENGE_NOT_FOUND',
        message: 'Challenge not found.',
      });
    }

    if (user.emailVerified) {
      return res.status(400).json({
        success: false,
        code: 'OTP_ALREADY_USED',
        message: 'Email is already verified.',
      });
    }

    // Create a new challenge (invalidates old one by creating fresh)
    const { challengeId: newChallengeId, otp } = await createChallenge(user._id, 'email');

    // Simulated email delivery
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      console.log('\n========================================');
      console.log('[SIMULATED EMAIL]');
      console.log(`To: ${user.email}`);
      console.log(`OTP: ${otp}`);
      console.log('========================================\n');
    }

    return res.status(200).json({
      success: true,
      message: 'Verification code sent to your email.',
      challengeId: newChallengeId,
      next: 'email-otp',
    });
  } catch (error) {
    console.error('Send email OTP error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'An unexpected error occurred.',
    });
  }
}

/**
 * POST /api/verify-email-otp
 */
async function verifyEmailOtp(req, res) {
  try {
    const { challengeId, otp } = req.body;

    if (!challengeId || !otp) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Challenge ID and OTP are required.',
      });
    }

    const result = await verifyChallenge(challengeId, otp, 'email');

    if (!result.success) {
      const statusCode = result.code === 'CHALLENGE_NOT_FOUND' ? 404 : 400;
      return res.status(statusCode).json({
        success: false,
        code: result.code,
        message: result.message,
        attemptsRemaining: result.attemptsRemaining,
      });
    }

    // Mark email as verified
    const challenge = await OtpChallenge.findOne({ challengeId });
    const user = await User.findById(challenge.userId);
    user.emailVerified = true;
    user.registrationStatus = 'email-verified';
    await user.save();

    // Generate SMS OTP challenge
    const { challengeId: smsChallengeId, otp: smsOtp } = await createChallenge(user._id, 'sms');

    // Simulated SMS delivery
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      console.log('\n========================================');
      console.log('[SIMULATED SMS]');
      console.log(`To: ${user.phone}`);
      console.log(`OTP: ${smsOtp}`);
      console.log('========================================\n');
    }

    return res.status(200).json({
      success: true,
      message: 'Email verified successfully.',
      challengeId: smsChallengeId,
      next: 'sms-otp',
    });
  } catch (error) {
    console.error('Verify email OTP error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'An unexpected error occurred.',
    });
  }
}

/**
 * POST /api/send-sms-otp
 */
async function sendSmsOtp(req, res) {
  try {
    const { challengeId } = req.body;

    if (!challengeId) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Challenge ID is required.',
      });
    }

    const existingChallenge = await OtpChallenge.findOne({ challengeId });
    if (!existingChallenge) {
      return res.status(404).json({
        success: false,
        code: 'CHALLENGE_NOT_FOUND',
        message: 'Challenge not found.',
      });
    }

    const user = await User.findById(existingChallenge.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        code: 'CHALLENGE_NOT_FOUND',
        message: 'Challenge not found.',
      });
    }

    if (!user.emailVerified) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Email must be verified first.',
      });
    }

    if (user.phoneVerified) {
      return res.status(400).json({
        success: false,
        code: 'OTP_ALREADY_USED',
        message: 'Phone is already verified.',
      });
    }

    const { challengeId: newChallengeId, otp } = await createChallenge(user._id, 'sms');

    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      console.log('\n========================================');
      console.log('[SIMULATED SMS]');
      console.log(`To: ${user.phone}`);
      console.log(`OTP: ${otp}`);
      console.log('========================================\n');
    }

    return res.status(200).json({
      success: true,
      message: 'Verification code sent to your phone.',
      challengeId: newChallengeId,
      next: 'sms-otp',
    });
  } catch (error) {
    console.error('Send SMS OTP error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'An unexpected error occurred.',
    });
  }
}

/**
 * POST /api/verify-sms-otp
 */
async function verifySmsOtp(req, res) {
  try {
    const { challengeId, otp } = req.body;

    if (!challengeId || !otp) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Challenge ID and OTP are required.',
      });
    }

    const result = await verifyChallenge(challengeId, otp, 'sms');

    if (!result.success) {
      const statusCode = result.code === 'CHALLENGE_NOT_FOUND' ? 404 : 400;
      return res.status(statusCode).json({
        success: false,
        code: result.code,
        message: result.message,
        attemptsRemaining: result.attemptsRemaining,
      });
    }

    // Mark phone as verified
    const challenge = await OtpChallenge.findOne({ challengeId });
    const user = await User.findById(challenge.userId);
    user.phoneVerified = true;
    user.registrationStatus = 'phone-verified';
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Phone number verified successfully.',
      next: 'mfa-setup',
      userId: user._id,
    });
  } catch (error) {
    console.error('Verify SMS OTP error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'An unexpected error occurred.',
    });
  }
}

module.exports = {
  register,
  sendEmailOtp,
  verifyEmailOtp,
  sendSmsOtp,
  verifySmsOtp,
};
