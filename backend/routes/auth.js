const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const mfaController = require('../controllers/mfaController');
const loginController = require('../controllers/loginController');
const { authMiddleware, sessionAuthMiddleware, jwtAuthMiddleware } = require('../middleware/auth');

router.post('/register', authController.register);
router.post('/send-email-otp', authController.sendEmailOtp);
router.post('/verify-email-otp', authController.verifyEmailOtp);
router.post('/send-sms-otp', authController.sendSmsOtp);
router.post('/verify-sms-otp', authController.verifySmsOtp);
router.post('/mfa/setup', mfaController.setupMfa);
router.post('/mfa/verify', mfaController.verifyMfa);

router.post('/login', loginController.login);
router.post('/verify-login-otp', loginController.loginVerifyMfa);
router.post('/login/verify-mfa', loginController.loginVerifyMfa);

router.get('/me', sessionAuthMiddleware, loginController.getMe);
router.post('/logout', loginController.logout);

router.post('/token', loginController.issueToken);
router.get('/protected', jwtAuthMiddleware, loginController.getProtected);

router.get('/dashboard', authMiddleware, loginController.getDashboard);

module.exports = router;
