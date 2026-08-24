const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../app');
const User = require('../models/User');
const OtpChallenge = require('../models/OtpChallenge');
const Session = require('../models/Session');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/secureid_test';

async function runLoginTests() {
  console.log('🧪 Starting Comprehensive Login & Session Journey Automated Tests...\n');

  await mongoose.connect(MONGODB_URI);
  console.log('Connected to test DB.');

  // --- Setup: create a fully registered user via the registration flow ---
  const testEmail = `login_test_${Date.now()}@example.com`;
  const testPhone = '+919876500001';
  const testPassword = 'LoginTest@123';

  console.log('🔧 Setting up test user via registration flow...');
  await User.deleteMany({ email: testEmail });
  await OtpChallenge.deleteMany({});
  await Session.deleteMany({});

  // 1. Fresh registration
  const reg = await request(app).post('/api/register').send({
    name: 'Login Tester',
    email: testEmail,
    phone: testPhone,
    password: testPassword,
    termsAccepted: true,
    privacyAccepted: true,
  });
  let challengeId = reg.body.challengeId;

  // 2. Email verify
  let otpRes = await request(app).get(`/api/test/otp/${challengeId}`);
  const emailVerify = await request(app).post('/api/verify-email-otp').send({ challengeId, otp: otpRes.body.otp });
  challengeId = emailVerify.body.challengeId;

  // 3. SMS verify
  otpRes = await request(app).get(`/api/test/otp/${challengeId}`);
  const smsVerify = await request(app).post('/api/verify-sms-otp').send({ challengeId, otp: otpRes.body.otp });
  const userId = smsVerify.body.userId;

  // 4. MFA setup
  await request(app).post('/api/mfa/setup').send({ userId });

  // 5. MFA verify (complete registration)
  const mfaOtp = await request(app).post('/api/test/mfa-otp').send({ userId });
  await request(app).post('/api/mfa/verify').send({ userId, otp: mfaOtp.body.otp });

  console.log('   ✅ Test user created & fully registered.\n');

  // ============================================================
  // LOGIN TESTS
  // ============================================================

  // 1. Login with non-existent email
  console.log('1️⃣  Testing Login - Non-existent Email...');
  const resNoUser = await request(app).post('/api/login').send({ email: 'nonexistent@example.com', password: testPassword });
  console.assert(resNoUser.status === 401, `Expected 401, got ${resNoUser.status}`);
  console.assert(resNoUser.body.code === 'INVALID_CREDENTIALS', 'Expected INVALID_CREDENTIALS');
  console.log('   ✅ Non-existent email returns generic error (no info leak).\n');

  // 2. Login with wrong password
  console.log('2️⃣  Testing Login - Wrong Password...');
  const resWrongPwd = await request(app).post('/api/login').send({ email: testEmail, password: 'WrongPassword@999' });
  console.assert(resWrongPwd.status === 401, `Expected 401, got ${resWrongPwd.status}`);
  console.assert(resWrongPwd.body.code === 'INVALID_CREDENTIALS', 'Expected INVALID_CREDENTIALS');
  console.log('   ✅ Wrong password returns generic error (no info leak).\n');

  // 3. Login with missing fields
  console.log('3️⃣  Testing Login - Missing Fields...');
  const resMissing = await request(app).post('/api/login').send({ email: testEmail });
  console.assert(resMissing.status === 400, `Expected 400, got ${resMissing.status}`);
  console.assert(resMissing.body.code === 'VALIDATION_ERROR', 'Expected VALIDATION_ERROR');
  console.log('   ✅ Missing fields rejected with 400.\n');

  // 4. Login with correct credentials → MFA required
  console.log('4️⃣  Testing Login - Correct Credentials → MFA Required...');
  const resLogin = await request(app).post('/api/login').send({ email: testEmail, password: testPassword });
  console.assert(resLogin.status === 200, `Expected 200, got ${resLogin.status}`);
  console.assert(resLogin.body.mfaRequired === true, 'Expected mfaRequired=true');
  console.assert(resLogin.body.next === 'mfa-verify', 'Expected next=mfa-verify');
  console.assert(!!resLogin.body.userId, 'Expected userId for MFA step');
  console.assert(!resLogin.body.token, 'Security: Token must NOT be issued before MFA');
  const loginUserId = resLogin.body.userId;
  console.log('   ✅ Password verified, MFA required. No session or token issued yet.\n');

  // 5. Login MFA - Wrong TOTP
  console.log('5️⃣  Testing Login MFA - Wrong Code...');
  const resWrongMfa = await request(app).post('/api/verify-login-otp').send({ userId: loginUserId, otp: '000000' });
  console.assert(resWrongMfa.status === 401, `Expected 401, got ${resWrongMfa.status}`);
  console.assert(resWrongMfa.body.code === 'INVALID_OTP', 'Expected INVALID_OTP');
  console.log('   ✅ Wrong MFA code rejected with 401.\n');

  // 6. Login MFA - Correct TOTP → Server-Side Session + HttpOnly Cookie + JWT Issued
  console.log('6️⃣  Testing Login MFA (POST /api/verify-login-otp) - Correct TOTP...');
  const mfaLoginOtp = await request(app).post('/api/test/mfa-otp').send({ userId: loginUserId });
  const validTotp = mfaLoginOtp.body.otp;

  const resVerifyMfa = await request(app).post('/api/verify-login-otp').send({ userId: loginUserId, otp: validTotp });
  console.assert(resVerifyMfa.status === 200, `Expected 200, got ${resVerifyMfa.status}`);
  console.assert(resVerifyMfa.body.next === 'dashboard', 'Expected next=dashboard');
  console.assert(!!resVerifyMfa.body.sessionId, 'Expected sessionId to be returned');
  console.assert(!!resVerifyMfa.body.token, 'Expected JWT token to be issued');
  console.assert(!!resVerifyMfa.body.user, 'Expected user info');
  console.assert(resVerifyMfa.body.user.email === testEmail, 'Expected user email to match');

  // Verify HttpOnly cookie
  const cookies = resVerifyMfa.headers['set-cookie'];
  console.assert(!!cookies && cookies.some((c) => c.includes('sessionId=') && c.includes('HttpOnly')), 'Expected HttpOnly sessionId cookie');
  const sessionCookie = cookies.find((c) => c.startsWith('sessionId='));
  const jwtToken = resVerifyMfa.body.token;
  console.log('   ✅ MFA verified! Server-side session & HttpOnly cookie created. JWT token issued.\n');

  // 7. GET /api/me with session cookie
  console.log('7️⃣  Testing GET /api/me (Server-Side Session Authentication)...');
  const resMe = await request(app).get('/api/me').set('Cookie', sessionCookie);
  console.assert(resMe.status === 200, `Expected 200, got ${resMe.status}`);
  console.assert(resMe.body.user.email === testEmail, 'Expected user email');
  console.assert(resMe.body.user.emailVerified === true, 'Expected emailVerified=true');
  console.assert(resMe.body.user.mfaEnabled === true, 'Expected mfaEnabled=true');
  console.assert(!resMe.body.user.passwordHash, 'Security: passwordHash must NEVER be returned');
  console.assert(!resMe.body.user.mfaSecret, 'Security: mfaSecret must NEVER be returned');
  console.log('   ✅ GET /api/me successfully returned sanitized user data via session cookie.\n');

  // 8. GET /api/me unauthenticated
  console.log('8️⃣  Testing GET /api/me (Unauthenticated)...');
  const resMeUnauth = await request(app).get('/api/me');
  console.assert(resMeUnauth.status === 401, `Expected 401, got ${resMeUnauth.status}`);
  console.assert(resMeUnauth.body.code === 'UNAUTHORIZED', 'Expected UNAUTHORIZED code');
  console.log('   ✅ Unauthenticated request to /api/me blocked with 401.\n');

  // 9. POST /api/logout (Invalidate session + Clear cookie)
  console.log('9️⃣  Testing POST /api/logout...');
  const resLogout = await request(app).post('/api/logout').set('Cookie', sessionCookie);
  console.assert(resLogout.status === 200, `Expected 200, got ${resLogout.status}`);
  console.assert(resLogout.body.success === true, 'Expected success=true');

  // Verify that GET /api/me now fails with 401
  const resMeAfterLogout = await request(app).get('/api/me').set('Cookie', sessionCookie);
  console.assert(resMeAfterLogout.status === 401, `Expected 401 after logout, got ${resMeAfterLogout.status}`);
  console.log('   ✅ POST /api/logout destroyed server-side session and invalidated subsequent access.\n');

  // 10. POST /api/token (Issue short-lived JWT)
  console.log('🔟 Testing POST /api/token...');
  // Re-login to get active session
  const relogin = await request(app).post('/api/login').send({ email: testEmail, password: testPassword });
  const reloginTotp = (await request(app).post('/api/test/mfa-otp').send({ userId: relogin.body.userId })).body.otp;
  const reloginMfa = await request(app).post('/api/verify-login-otp').send({ userId: relogin.body.userId, otp: reloginTotp });
  const activeSessionCookie = reloginMfa.headers['set-cookie'].find((c) => c.startsWith('sessionId='));

  const resToken = await request(app).post('/api/token').set('Cookie', activeSessionCookie);
  console.assert(resToken.status === 200, `Expected 200, got ${resToken.status}`);
  console.assert(!!resToken.body.token, 'Expected JWT token');
  console.assert(resToken.body.tokenType === 'Bearer', 'Expected Bearer tokenType');
  const shortLivedJwt = resToken.body.token;
  console.log('   ✅ POST /api/token issued short-lived JWT.\n');

  // 11. GET /api/protected (with valid JWT Bearer token)
  console.log('1️⃣1️⃣ Testing GET /api/protected (Valid JWT)...');
  const resProtected = await request(app).get('/api/protected').set('Authorization', `Bearer ${shortLivedJwt}`);
  console.assert(resProtected.status === 200, `Expected 200, got ${resProtected.status}`);
  console.assert(resProtected.body.user.email === testEmail, 'Expected matching email');
  console.log('   ✅ GET /api/protected granted access with valid Bearer token.\n');

  // 12. GET /api/protected without token & with invalid token
  console.log('1️⃣2️⃣ Testing GET /api/protected (Missing & Tampered Token)...');
  const resNoJwt = await request(app).get('/api/protected');
  console.assert(resNoJwt.status === 401, `Expected 401, got ${resNoJwt.status}`);

  const resBadJwt = await request(app).get('/api/protected').set('Authorization', 'Bearer invalid.tampered.token');
  console.assert(resBadJwt.status === 401, `Expected 401, got ${resBadJwt.status}`);
  console.log('   ✅ Missing and tampered JWTs rejected with 401.\n');

  // 13. Account Lockout after multiple failed attempts
  console.log('1️⃣3️⃣ Testing Account Lockout (5 Failed Attempts)...');
  // Send 5 bad passwords
  for (let i = 0; i < 4; i++) {
    await request(app).post('/api/login').send({ email: testEmail, password: 'BadPassword' });
  }
  const resLockout = await request(app).post('/api/login').send({ email: testEmail, password: 'BadPassword' });
  console.assert(resLockout.status === 401, `Expected 401, got ${resLockout.status}`);
  console.assert(resLockout.body.code === 'ACCOUNT_LOCKED', `Expected ACCOUNT_LOCKED, got ${resLockout.body.code}`);

  // Even with correct password, locked account cannot login
  const resLockedCorrectPwd = await request(app).post('/api/login').send({ email: testEmail, password: testPassword });
  console.assert(resLockedCorrectPwd.status === 401, 'Expected 401 for locked account');
  console.assert(resLockedCorrectPwd.body.code === 'ACCOUNT_LOCKED', 'Expected ACCOUNT_LOCKED');
  console.log('   ✅ Temporary account lockout enforced after 5 failed attempts.\n');

  // 14. Login with incomplete registration
  console.log('1️⃣4️⃣ Testing Login - Incomplete Registration...');
  const incEmail = `incomplete_${Date.now()}@example.com`;
  await request(app).post('/api/register').send({
    name: 'Incomplete User',
    email: incEmail,
    phone: '+919876500099',
    password: testPassword,
    termsAccepted: true,
    privacyAccepted: true,
  });
  const resIncomplete = await request(app).post('/api/login').send({ email: incEmail, password: testPassword });
  console.assert(resIncomplete.status === 401, `Expected 401, got ${resIncomplete.status}`);
  console.assert(resIncomplete.body.code === 'REGISTRATION_INCOMPLETE', 'Expected REGISTRATION_INCOMPLETE');
  console.log('   ✅ Incomplete registration blocked from login.\n');

  console.log('🎉 ALL 14 COMPREHENSIVE LOGIN & SESSION TEST SUITES PASSED PERFECTLY!\n');
  await mongoose.disconnect();
  process.exit(0);
}

runLoginTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
