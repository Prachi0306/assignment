const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const OtpChallenge = require('../models/OtpChallenge');

function generateOtp() {
  const otp = crypto.randomInt(100000, 999999).toString();
  return otp;
}

function generateChallengeId() {
  return crypto.randomUUID();
}

async function hashOtp(otp) {
  return bcrypt.hash(otp, 10);
}

async function compareOtp(otp, hash) {
  return bcrypt.compare(otp, hash);
}

function getEvaluatorKey() {
  const secret = process.env.EVALUATOR_SECRET;
  if (!secret) return null;
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptOtp(otp) {
  const key = getEvaluatorKey();
  if (!key) return null;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(otp, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, encrypted, authTag]).toString('base64');
}

function decryptOtp(encryptedBase64) {
  const key = getEvaluatorKey();
  if (!key || !encryptedBase64) return null;

  try {
    const data = Buffer.from(encryptedBase64, 'base64');
    const iv = data.subarray(0, 12);
    const authTag = data.subarray(data.length - 16);
    const ciphertext = data.subarray(12, data.length - 16);

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, null, 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    return null;
  }
}

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
    otpPlain: isDev ? otp : null,
    otpEncrypted: !isDev ? encryptOtp(otp) : null,
    expiresAt: new Date(Date.now() + expiryMinutes * 60 * 1000),
    attempts: 0,
    maxAttempts,
    verified: false,
  });

  return { challengeId, otp, challenge };
}

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

  challenge.verified = true;
  await challenge.save();

  return { success: true, code: 'VERIFIED', message: 'Verification successful.' };
}

module.exports = {
  generateOtp,
  generateChallengeId,
  hashOtp,
  compareOtp,
  encryptOtp,
  decryptOtp,
  createChallenge,
  verifyChallenge,
};

