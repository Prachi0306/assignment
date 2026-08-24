const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const OtpChallenge = require('../models/OtpChallenge');

/**
 * Generate a cryptographically secure 6-digit OTP.
 */
function generateOtp() {
  // crypto.randomInt is cryptographically secure
  const otp = crypto.randomInt(100000, 999999).toString();
  return otp;
}

/**
 * Generate a unique challenge ID.
 */
function generateChallengeId() {
  return crypto.randomUUID();
}

/**
 * Hash an OTP for storage (using bcrypt so timing-safe comparison is built in).
 */
async function hashOtp(otp) {
  return bcrypt.hash(otp, 10);
}

/**
 * Compare a submitted OTP against the stored hash.
 */
async function compareOtp(otp, hash) {
  return bcrypt.compare(otp, hash);
}

/**
 * Create a new OTP challenge.
 * @param {string} userId - The user's MongoDB _id
 * @param {string} channel - 'email' | 'sms' | 'mfa'
 * @param {object} options
 * @returns {object} { challengeId, otp } - otp is returned in-memory only for simulated delivery
 */
async function createChallenge(userId, channel, options = {}) {
  const otp = generateOtp();
  const otpHash = await hashOtp(otp);
  const challengeId = generateChallengeId();

  const expiryMinutes = parseInt(process.env.OTP_EXPIRY_MINUTES, 10) || 3;
  const maxAttempts = parseInt(process.env.OTP_MAX_ATTEMPTS, 10) || 3;

  const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';

  const challenge = await OtpChallenge.create({
    challengeId,
    userId,
    channel,
    otpHash,
    otpPlain: isDev ? otp : null, // Store plaintext only in dev for test endpoint
    expiresAt: new Date(Date.now() + expiryMinutes * 60 * 1000),
    attempts: 0,
    maxAttempts,
    verified: false,
  });

  return { challengeId, otp, challenge };
}

/**
 * Verify an OTP against a challenge.
 * Returns: { success, code, message }
 */
async function verifyChallenge(challengeId, submittedOtp, expectedChannel) {
  const challenge = await OtpChallenge.findOne({ challengeId });

  if (!challenge) {
    return { success: false, code: 'CHALLENGE_NOT_FOUND', message: 'Challenge not found.' };
  }

  if (challenge.channel !== expectedChannel) {
    return { success: false, code: 'CHALLENGE_NOT_FOUND', message: 'Challenge not found.' };
  }

  if (challenge.verified) {
    return { success: false, code: 'OTP_ALREADY_USED', message: 'This code has already been used.' };
  }

  if (new Date() > challenge.expiresAt) {
    return { success: false, code: 'OTP_EXPIRED', message: 'Verification code has expired. Please request a new one.' };
  }

  if (challenge.attempts >= challenge.maxAttempts) {
    return { success: false, code: 'OTP_MAX_ATTEMPTS', message: 'Maximum verification attempts exceeded. Please request a new code.' };
  }

  const isValid = await compareOtp(submittedOtp, challenge.otpHash);

  if (!isValid) {
    challenge.attempts += 1;
    await challenge.save();

    const remaining = challenge.maxAttempts - challenge.attempts;

    if (challenge.attempts >= challenge.maxAttempts) {
      return {
        success: false,
        code: 'OTP_MAX_ATTEMPTS',
        message: 'Maximum verification attempts exceeded. Please request a new code.',
        attemptsRemaining: 0,
      };
    }

    return {
      success: false,
      code: 'INVALID_OTP',
      message: 'Invalid verification code. Please try again.',
      attemptsRemaining: remaining,
    };
  }

  // OTP is valid – mark as verified (single-use)
  challenge.verified = true;
  await challenge.save();

  return { success: true, code: 'VERIFIED', message: 'Verification successful.' };
}

module.exports = {
  generateOtp,
  generateChallengeId,
  hashOtp,
  compareOtp,
  createChallenge,
  verifyChallenge,
};
