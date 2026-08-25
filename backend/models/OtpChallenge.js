const mongoose = require('mongoose');

const otpChallengeSchema = new mongoose.Schema(
  {
    challengeId: {
      type: String,
      required: true,
      unique: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    channel: {
      type: String,
      enum: ['email', 'sms', 'mfa'],
      required: true,
    },
    otpHash: {
      type: String,
      required: true,
    },
    otpPlain: {
      type: String,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    maxAttempts: {
      type: Number,
      default: 3,
    },
    verified: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

otpChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });
otpChallengeSchema.index({ userId: 1, channel: 1 });

module.exports = mongoose.model('OtpChallenge', otpChallengeSchema);
