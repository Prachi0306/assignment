const express = require('express');
const router = express.Router();
const OtpChallenge = require('../models/OtpChallenge');
const mfaController = require('../controllers/mfaController');
const { decryptOtp } = require('../utils/otp');

router.use((req, res, next) => {
  const env = process.env.NODE_ENV;

  if (env === 'development' || env === 'test') {
    return next();
  }

  const evaluatorSecret = process.env.EVALUATOR_SECRET;
  if (!evaluatorSecret) {
    return res.status(404).json({ success: false, message: 'Not found.' });
  }

  const providedKey = req.headers['x-evaluator-key'];
  if (!providedKey || providedKey !== evaluatorSecret) {
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

    let otp = challenge.otpPlain;

    if (!otp && challenge.otpEncrypted) {
      otp = decryptOtp(challenge.otpEncrypted);
    }

    if (!otp) {
      return res.status(404).json({
        success: false,
        message: 'OTP not available.',
      });
    }

    return res.status(200).json({
      success: true,
      otp,
      channel: challenge.channel,
      expiresAt: challenge.expiresAt,
      attempts: challenge.attempts,
      maxAttempts: challenge.maxAttempts,
      verified: challenge.verified,
      note: 'EVALUATOR TESTING ONLY — This endpoint is protected and not for public use.',
    });
  } catch (error) {
    console.error('Test OTP retrieval error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

router.post('/mfa-otp', mfaController.generateTestMfaOtp);

module.exports = router;

