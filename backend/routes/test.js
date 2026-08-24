const express = require('express');
const router = express.Router();
const OtpChallenge = require('../models/OtpChallenge');
const mfaController = require('../controllers/mfaController');

router.use((req, res, next) => {
  if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
    return res.status(404).json({ success: false, message: 'Not found.' });
  }
  next();
});

router.get('/otp/:challengeId', async (req, res) => {
  try {
    const { challengeId } = req.params;
    const challenge = await OtpChallenge.findOne({ challengeId });

    if (!challenge) {
      return res.status(404).json({
        success: false,
        message: 'Challenge not found.',
      });
    }

    if (!challenge.otpPlain) {
      return res.status(404).json({
        success: false,
        message: 'OTP not available (may not be in dev mode).',
      });
    }

    return res.status(200).json({
      success: true,
      otp: challenge.otpPlain,
      channel: challenge.channel,
      expiresAt: challenge.expiresAt,
      attempts: challenge.attempts,
      maxAttempts: challenge.maxAttempts,
      verified: challenge.verified,
      note: 'DEVELOPMENT/TEST ONLY — This endpoint must be disabled in production.',
    });
  } catch (error) {
    console.error('Test OTP retrieval error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

router.post('/mfa-otp', mfaController.generateTestMfaOtp);

module.exports = router;
