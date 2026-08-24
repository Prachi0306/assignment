require('dotenv').config();
const { connectDB } = require('./utils/db');
const app = require('./app');

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await connectDB();

    app.listen(PORT, () => {
      console.log(`\n🚀 SecureID API Server running on http://localhost:${PORT}`);
      console.log(`📋 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 Frontend: ${process.env.FRONTEND_URL || 'http://localhost:5500'}`);

      if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
        console.log('\n⚠️  TEST-ONLY endpoints enabled:');
        console.log(`   GET  http://localhost:${PORT}/api/test/otp/:challengeId`);
        console.log(`   POST http://localhost:${PORT}/api/test/mfa-otp`);
      }

      if (process.env.NODE_ENV === 'production') {
        console.log('\n🔒 Production mode: Test endpoints DISABLED.');
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

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
  process.exit(1);
});

startServer();
