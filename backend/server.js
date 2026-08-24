require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./app');

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/secureid';

async function startServer() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB:', MONGODB_URI);

    // Start Express server
    app.listen(PORT, () => {
      console.log(`\n🚀 SecureID API Server running on http://localhost:${PORT}`);
      console.log(`📋 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 Frontend: ${process.env.FRONTEND_URL || 'http://localhost:5500'}`);

      if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
        console.log('\n⚠️  TEST-ONLY endpoints enabled:');
        console.log(`   GET  http://localhost:${PORT}/api/test/otp/:challengeId`);
        console.log(`   POST http://localhost:${PORT}/api/test/mfa-otp`);
      }

      console.log('\n📡 API Endpoints:');
      console.log(`   POST http://localhost:${PORT}/api/register`);
      console.log(`   POST http://localhost:${PORT}/api/send-email-otp`);
      console.log(`   POST http://localhost:${PORT}/api/verify-email-otp`);
      console.log(`   POST http://localhost:${PORT}/api/send-sms-otp`);
      console.log(`   POST http://localhost:${PORT}/api/verify-sms-otp`);
      console.log(`   POST http://localhost:${PORT}/api/mfa/setup`);
      console.log(`   POST http://localhost:${PORT}/api/mfa/verify`);
      console.log(`   GET  http://localhost:${PORT}/api/health\n`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
  process.exit(1);
});

startServer();
