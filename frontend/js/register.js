/**
 * SecureID – Registration Journey (Vanilla JS)
 * All screens are managed in a single page with state-driven transitions.
 */

(function () {
  'use strict';

  // ============================================
  // Configuration
  // ============================================
  const API_BASE = (() => {
    // 1. Explicit override (e.g., for custom deployments)
    if (window.API_BASE_URL) return window.API_BASE_URL;
    // 2. Local dev with Live Server (frontend on :5500, backend on :3000)
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      if (window.location.port === '5500') return 'http://localhost:3000/api';
    }
    // 3. Same-origin (production on Vercel, or backend serving frontend)
    return `${window.location.origin}/api`;
  })();

  // ============================================
  // State
  // ============================================
  const state = {
    currentScreen: 'register',
    challengeId: null,
    userId: null,
    email: '',
    phone: '',
    name: '',
    mfaMethod: 'authenticator',
    mfaSetupKey: '',
    timers: {},
  };

  // ============================================
  // Screen Management
  // ============================================
  const screens = [
    'screen-register',
    'screen-email-otp',
    'screen-sms-otp',
    'screen-mfa-setup',
    'screen-mfa-qr',
    'screen-mfa-verify',
    'screen-success',
  ];

  function showScreen(screenId) {
    screens.forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        if (id === screenId) {
          el.classList.remove('hidden');
          el.style.animation = 'none';
          // Force reflow then re-apply animation
          el.offsetHeight;
          el.style.animation = '';
        } else {
          el.classList.add('hidden');
        }
      }
    });
    state.currentScreen = screenId;
  }

  // ============================================
  // API Helper
  // ============================================
  async function apiCall(endpoint, method = 'POST', body = null) {
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body) options.body = JSON.stringify(body);

    const response = await fetch(`${API_BASE}${endpoint}`, options);
    const data = await response.json();
    return { status: response.status, ...data };
  }

  // ============================================
  // Alert Helper
  // ============================================
  function showAlert(containerId, type, message) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const iconSvg =
      type === 'error'
        ? '<svg class="alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
        : type === 'success'
        ? '<svg class="alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
        : '<svg class="alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';

    container.className = `alert alert-${type}`;
    container.innerHTML = `${iconSvg}<span>${message}</span>`;
    container.classList.remove('hidden');
  }

  function hideAlert(containerId) {
    const container = document.getElementById(containerId);
    if (container) {
      container.classList.add('hidden');
      container.innerHTML = '';
    }
  }

  // ============================================
  // Validation
  // ============================================
  function showFieldError(fieldId, message) {
    const errorEl = document.getElementById(`${fieldId}-error`);
    const inputEl = document.getElementById(fieldId);
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.remove('hidden');
    }
    if (inputEl) inputEl.classList.add('error');
  }

  function clearFieldError(fieldId) {
    const errorEl = document.getElementById(`${fieldId}-error`);
    const inputEl = document.getElementById(fieldId);
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.classList.add('hidden');
    }
    if (inputEl) inputEl.classList.remove('error');
  }

  function clearAllErrors() {
    ['reg-name', 'reg-email', 'reg-phone', 'reg-password', 'reg-terms', 'reg-privacy'].forEach(clearFieldError);
    hideAlert('register-alert');
  }

  function validateForm() {
    clearAllErrors();
    let isValid = true;

    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const prefix = document.getElementById('reg-phone-prefix').value.trim();
    const phone = document.getElementById('reg-phone').value.trim();
    const password = document.getElementById('reg-password').value;
    const terms = document.getElementById('reg-terms').checked;
    const privacy = document.getElementById('reg-privacy').checked;

    if (!name || name.length < 2) {
      showFieldError('reg-name', 'Full name must be at least 2 characters.');
      isValid = false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      showFieldError('reg-email', 'Please enter a valid email address.');
      isValid = false;
    }

    if (!phone || phone.length < 7) {
      showFieldError('reg-phone', 'Please enter a valid mobile number.');
      isValid = false;
    }

    const passErrors = [];
    if (password.length < 8) passErrors.push('at least 8 characters');
    if (!/[A-Z]/.test(password)) passErrors.push('1 uppercase letter');
    if (!/[0-9]/.test(password)) passErrors.push('1 number');
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password)) passErrors.push('1 special character');
    if (passErrors.length > 0) {
      showFieldError('reg-password', `Password needs: ${passErrors.join(', ')}.`);
      isValid = false;
    }

    if (!terms) {
      showFieldError('reg-terms', 'You must accept the Terms & Conditions.');
      isValid = false;
    }

    if (!privacy) {
      showFieldError('reg-privacy', 'You must accept the Privacy Policy.');
      isValid = false;
    }

    return isValid
      ? { name, email, phone: prefix + phone.replace(/[\s\-()]/g, ''), password, termsAccepted: terms, privacyAccepted: privacy }
      : null;
  }

  // ============================================
  // Password Requirements Live Update
  // ============================================
  function updatePasswordRequirements() {
    const password = document.getElementById('reg-password').value;

    const reqs = [
      { id: 'req-length', test: password.length >= 8 },
      { id: 'req-uppercase', test: /[A-Z]/.test(password) },
      { id: 'req-number', test: /[0-9]/.test(password) },
      { id: 'req-special', test: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password) },
    ];

    reqs.forEach(({ id, test }) => {
      const el = document.getElementById(id);
      if (el) {
        if (test) {
          el.classList.add('met');
          el.querySelector('.req-icon').textContent = '✓';
        } else {
          el.classList.remove('met');
          el.querySelector('.req-icon').textContent = '✗';
        }
      }
    });
  }

  // ============================================
  // Password Toggle
  // ============================================
  function initPasswordToggle() {
    const toggleBtn = document.getElementById('toggle-password');
    const passwordInput = document.getElementById('reg-password');
    const eyeIcon = document.getElementById('eye-icon');
    const eyeOffIcon = document.getElementById('eye-off-icon');

    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const isPassword = passwordInput.type === 'password';
        passwordInput.type = isPassword ? 'text' : 'password';
        eyeIcon.classList.toggle('hidden');
        eyeOffIcon.classList.toggle('hidden');
      });
    }
  }

  // ============================================
  // OTP Input Management
  // ============================================
  function initOtpInputs(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const inputs = container.querySelectorAll('.otp-input');

    inputs.forEach((input, index) => {
      // Only allow numeric input
      input.addEventListener('input', (e) => {
        const value = e.target.value.replace(/[^0-9]/g, '');
        e.target.value = value;

        if (value && index < inputs.length - 1) {
          inputs[index + 1].focus();
        }

        // Clear error states on input
        inputs.forEach((inp) => inp.classList.remove('error'));
      });

      // Handle backspace
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !e.target.value && index > 0) {
          inputs[index - 1].focus();
          inputs[index - 1].value = '';
        }
      });

      // Handle paste
      input.addEventListener('paste', (e) => {
        e.preventDefault();
        const pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/[^0-9]/g, '');
        if (pasted.length === 6) {
          inputs.forEach((inp, i) => {
            inp.value = pasted[i] || '';
          });
          inputs[5].focus();
        }
      });
    });
  }

  function getOtpValue(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return '';
    const inputs = container.querySelectorAll('.otp-input');
    return Array.from(inputs).map((i) => i.value).join('');
  }

  function clearOtpInputs(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const inputs = container.querySelectorAll('.otp-input');
    inputs.forEach((inp) => {
      inp.value = '';
      inp.classList.remove('error', 'success');
    });
    if (inputs[0]) inputs[0].focus();
  }

  function setOtpError(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.querySelectorAll('.otp-input').forEach((inp) => inp.classList.add('error'));
  }

  function setOtpValues(containerId, otp) {
    const container = document.getElementById(containerId);
    if (!container || !otp || otp.length !== 6) return;
    const inputs = container.querySelectorAll('.otp-input');
    inputs.forEach((inp, i) => {
      inp.value = otp[i] || '';
      inp.classList.remove('error');
    });
    if (inputs[5]) inputs[5].focus();
  }

  // Dev-only helper: query test endpoint to show simulated OTP
  async function showDevOtpHelper(containerId, inputGroupId, challengeId) {
    try {
      const res = await fetch(`${API_BASE}/test/otp/${challengeId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.otp) {
          const alertEl = document.getElementById(containerId);
          if (alertEl) {
            alertEl.className = 'dev-simulated-banner';
            alertEl.innerHTML = `
              <div>
                <span class="dev-badge">Simulated ${data.channel.toUpperCase()}</span>
                <span>Code: <strong class="dev-code">${data.otp}</strong></span>
              </div>
              <button type="button" class="btn-autofill" id="btn-fill-${inputGroupId}">Auto-fill</button>
            `;
            alertEl.classList.remove('hidden');

            const btn = document.getElementById(`btn-fill-${inputGroupId}`);
            if (btn) {
              btn.onclick = () => setOtpValues(inputGroupId, data.otp);
            }
          }
        }
      }
    } catch (e) {
      // Ignore if in production or network error
    }
  }

  // ============================================
  // Timer Management
  // ============================================
  function startTimer(timerId, displayId, durationSeconds, onExpire) {
    // Clear existing timer
    if (state.timers[timerId]) {
      clearInterval(state.timers[timerId]);
    }

    let remaining = durationSeconds;
    const displayEl = document.getElementById(displayId);
    const timerContainer = document.getElementById(timerId);

    function updateDisplay() {
      const minutes = Math.floor(remaining / 60);
      const seconds = remaining % 60;
      if (displayEl) {
        displayEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      }
    }

    updateDisplay();
    if (timerContainer) timerContainer.classList.remove('hidden');

    state.timers[timerId] = setInterval(() => {
      remaining--;
      updateDisplay();

      if (remaining <= 0) {
        clearInterval(state.timers[timerId]);
        state.timers[timerId] = null;
        if (onExpire) onExpire();
      }
    }, 1000);
  }

  function enableResend(buttonId) {
    const btn = document.getElementById(buttonId);
    if (btn) {
      btn.disabled = false;
    }
  }

  function disableResend(buttonId) {
    const btn = document.getElementById(buttonId);
    if (btn) {
      btn.disabled = true;
    }
  }

  // ============================================
  // Button Loading State
  // ============================================
  function setButtonLoading(btnId, loading) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    if (loading) {
      btn.dataset.originalText = btn.innerHTML;
      btn.innerHTML = '<span class="spinner"></span> Please wait...';
      btn.disabled = true;
    } else {
      btn.innerHTML = btn.dataset.originalText || btn.innerHTML;
      btn.disabled = false;
    }
  }

  // ============================================
  // Mask helpers
  // ============================================
  function maskEmail(email) {
    if (!email) return '';
    const [local, domain] = email.split('@');
    if (local.length <= 2) return `${local}@${domain}`;
    return `${local[0]}${'•'.repeat(Math.min(local.length - 2, 6))}${local[local.length - 1]}@${domain}`;
  }

  function maskPhone(phone) {
    if (!phone) return '';
    if (phone.length <= 4) return phone;
    return phone.slice(0, -4).replace(/./g, '•') + phone.slice(-4);
  }

  // ============================================
  // Registration Flow
  // ============================================

  // 1. Registration Form Submit
  async function handleRegister(e) {
    e.preventDefault();
    const formData = validateForm();
    if (!formData) return;

    setButtonLoading('btn-register', true);
    hideAlert('register-alert');

    try {
      const result = await apiCall('/register', 'POST', formData);

      if (result.success) {
        state.challengeId = result.challengeId;
        state.email = formData.email;
        state.phone = formData.phone;
        state.name = formData.name;

        // Show email OTP screen
        document.getElementById('email-display').textContent = maskEmail(formData.email);
        showScreen('screen-email-otp');
        clearOtpInputs('email-otp-inputs');
        startEmailOtpTimer();
        disableResend('email-resend-btn');
        showDevOtpHelper('email-otp-alert', 'email-otp-inputs', result.challengeId);
      } else {
        if (result.code === 'VALIDATION_ERROR' && result.errors) {
          if (result.errors.name) showFieldError('reg-name', result.errors.name);
          if (result.errors.email) showFieldError('reg-email', result.errors.email);
          if (result.errors.phone) showFieldError('reg-phone', result.errors.phone);
          if (result.errors.password) showFieldError('reg-password', Array.isArray(result.errors.password) ? result.errors.password[0] : result.errors.password);
          if (result.errors.terms) showFieldError('reg-terms', result.errors.terms);
          if (result.errors.privacy) showFieldError('reg-privacy', result.errors.privacy);
        } else {
          showAlert('register-alert', 'error', result.message || 'Registration failed.');
        }
      }
    } catch (error) {
      showAlert('register-alert', 'error', 'Unable to connect to server. Please try again.');
    } finally {
      setButtonLoading('btn-register', false);
    }
  }

  // 2. Email OTP Timer
  function startEmailOtpTimer() {
    startTimer('email-otp-timer', 'email-timer-value', 180, () => {
      enableResend('email-resend-btn');
    });
    disableResend('email-resend-btn');

    // Enable resend after 30s even if timer hasn't expired
    setTimeout(() => enableResend('email-resend-btn'), 30000);
  }

  // 3. Verify Email OTP
  async function handleVerifyEmail() {
    const otp = getOtpValue('email-otp-inputs');
    if (otp.length !== 6) {
      showAlert('email-otp-alert', 'error', 'Please enter the complete 6-digit code.');
      setOtpError('email-otp-inputs');
      return;
    }

    setButtonLoading('btn-verify-email', true);
    hideAlert('email-otp-alert');

    try {
      const result = await apiCall('/verify-email-otp', 'POST', {
        challengeId: state.challengeId,
        otp,
      });

      if (result.success) {
        state.challengeId = result.challengeId;

        // Show SMS OTP screen
        document.getElementById('phone-display').textContent = maskPhone(state.phone);
        showScreen('screen-sms-otp');
        clearOtpInputs('sms-otp-inputs');
        startSmsOtpTimer();
        disableResend('sms-resend-btn');
        showDevOtpHelper('sms-otp-alert', 'sms-otp-inputs', result.challengeId);
      } else {
        setOtpError('email-otp-inputs');
        let msg = result.message || 'Verification failed.';
        if (result.attemptsRemaining !== undefined) {
          msg += ` ${result.attemptsRemaining} attempt(s) remaining.`;
        }
        showAlert('email-otp-alert', 'error', msg);

        if (result.code === 'OTP_MAX_ATTEMPTS') {
          showAlert('email-otp-alert', 'warning', 'Maximum attempts exceeded. Please request a new code.');
        }
      }
    } catch (error) {
      showAlert('email-otp-alert', 'error', 'Unable to verify. Please try again.');
    } finally {
      setButtonLoading('btn-verify-email', false);
    }
  }

  // 4. Resend Email OTP
  async function handleResendEmail() {
    disableResend('email-resend-btn');
    hideAlert('email-otp-alert');

    try {
      const result = await apiCall('/send-email-otp', 'POST', {
        challengeId: state.challengeId,
      });

      if (result.success) {
        state.challengeId = result.challengeId;
        clearOtpInputs('email-otp-inputs');
        startEmailOtpTimer();
        showDevOtpHelper('email-otp-alert', 'email-otp-inputs', result.challengeId);
      } else {
        showAlert('email-otp-alert', 'error', result.message || 'Failed to resend code.');
        enableResend('email-resend-btn');
      }
    } catch (error) {
      showAlert('email-otp-alert', 'error', 'Unable to resend code.');
      enableResend('email-resend-btn');
    }
  }

  // 5. SMS OTP Timer
  function startSmsOtpTimer() {
    startTimer('sms-otp-timer', 'sms-timer-value', 180, () => {
      enableResend('sms-resend-btn');
    });
    disableResend('sms-resend-btn');
    setTimeout(() => enableResend('sms-resend-btn'), 30000);
  }

  // 6. Verify SMS OTP
  async function handleVerifySms() {
    const otp = getOtpValue('sms-otp-inputs');
    if (otp.length !== 6) {
      showAlert('sms-otp-alert', 'error', 'Please enter the complete 6-digit code.');
      setOtpError('sms-otp-inputs');
      return;
    }

    setButtonLoading('btn-verify-sms', true);
    hideAlert('sms-otp-alert');

    try {
      const result = await apiCall('/verify-sms-otp', 'POST', {
        challengeId: state.challengeId,
        otp,
      });

      if (result.success) {
        state.userId = result.userId;
        showScreen('screen-mfa-setup');
      } else {
        setOtpError('sms-otp-inputs');
        let msg = result.message || 'Verification failed.';
        if (result.attemptsRemaining !== undefined) {
          msg += ` ${result.attemptsRemaining} attempt(s) remaining.`;
        }
        showAlert('sms-otp-alert', 'error', msg);

        if (result.code === 'OTP_MAX_ATTEMPTS') {
          showAlert('sms-otp-alert', 'warning', 'Maximum attempts exceeded. Please request a new code.');
        }
      }
    } catch (error) {
      showAlert('sms-otp-alert', 'error', 'Unable to verify. Please try again.');
    } finally {
      setButtonLoading('btn-verify-sms', false);
    }
  }

  // 7. Resend SMS OTP
  async function handleResendSms() {
    disableResend('sms-resend-btn');
    hideAlert('sms-otp-alert');

    try {
      const result = await apiCall('/send-sms-otp', 'POST', {
        challengeId: state.challengeId,
      });

      if (result.success) {
        state.challengeId = result.challengeId;
        clearOtpInputs('sms-otp-inputs');
        startSmsOtpTimer();
        showDevOtpHelper('sms-otp-alert', 'sms-otp-inputs', result.challengeId);
      } else {
        showAlert('sms-otp-alert', 'error', result.message || 'Failed to resend code.');
        enableResend('sms-resend-btn');
      }
    } catch (error) {
      showAlert('sms-otp-alert', 'error', 'Unable to resend code.');
      enableResend('sms-resend-btn');
    }
  }

  // 8. MFA Setup
  function initMfaOptions() {
    const options = document.querySelectorAll('.mfa-option');
    options.forEach((opt) => {
      opt.addEventListener('click', () => {
        options.forEach((o) => o.classList.remove('selected'));
        opt.classList.add('selected');
        state.mfaMethod = opt.dataset.method;
      });
    });
  }

  async function handleMfaContinue() {
    // For this assignment, we always use Authenticator App
    setButtonLoading('btn-mfa-continue', true);

    try {
      const result = await apiCall('/mfa/setup', 'POST', { userId: state.userId });

      if (result.success) {
        document.getElementById('mfa-qr-code').src = result.qrCode;
        document.getElementById('mfa-setup-key').textContent = result.setupKey;
        state.mfaSetupKey = result.setupKey;
        showScreen('screen-mfa-qr');
      } else {
        showAlert('register-alert', 'error', result.message || 'MFA setup failed.');
      }
    } catch (error) {
      alert('Unable to set up MFA. Please try again.');
    } finally {
      setButtonLoading('btn-mfa-continue', false);
    }
  }

  // 9. MFA QR Continue → show verification input
  async function handleMfaQrContinue() {
    showScreen('screen-mfa-verify');
    clearOtpInputs('mfa-otp-inputs');

    // Fetch dev test TOTP for easy testing
    try {
      const res = await fetch(`${API_BASE}/test/mfa-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: state.userId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.otp) {
          const alertEl = document.getElementById('mfa-otp-alert');
          if (alertEl) {
            alertEl.className = 'dev-simulated-banner';
            alertEl.innerHTML = `
              <div>
                <span class="dev-badge">Simulated MFA TOTP</span>
                <span>Code: <strong class="dev-code">${data.otp}</strong></span>
              </div>
              <button type="button" class="btn-autofill" id="btn-fill-mfa-otp">Auto-fill</button>
            `;
            alertEl.classList.remove('hidden');
            const btn = document.getElementById('btn-fill-mfa-otp');
            if (btn) {
              btn.onclick = () => setOtpValues('mfa-otp-inputs', data.otp);
            }
          }
        }
      }
    } catch (e) {}
  }

  // 10. Verify MFA
  async function handleVerifyMfa() {
    const otp = getOtpValue('mfa-otp-inputs');
    if (otp.length !== 6) {
      showAlert('mfa-otp-alert', 'error', 'Please enter the complete 6-digit code.');
      setOtpError('mfa-otp-inputs');
      return;
    }

    setButtonLoading('btn-verify-mfa', true);
    hideAlert('mfa-otp-alert');

    try {
      const result = await apiCall('/mfa/verify', 'POST', {
        userId: state.userId,
        otp,
      });

      if (result.success) {
        showScreen('screen-success');
        spawnConfetti();
      } else {
        setOtpError('mfa-otp-inputs');
        showAlert('mfa-otp-alert', 'error', result.message || 'Invalid code. Please try again.');
      }
    } catch (error) {
      showAlert('mfa-otp-alert', 'error', 'Unable to verify. Please try again.');
    } finally {
      setButtonLoading('btn-verify-mfa', false);
    }
  }

  // 11. Copy setup key
  function handleCopyKey() {
    const key = state.mfaSetupKey;
    if (!key) return;

    navigator.clipboard.writeText(key).then(() => {
      const btn = document.getElementById('btn-copy-key');
      const originalText = btn.innerHTML;
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Copied!';
      setTimeout(() => {
        btn.innerHTML = originalText;
      }, 2000);
    });
  }

  // 12. Back to MFA selection from QR
  function handleBackMfa() {
    showScreen('screen-mfa-setup');
  }

  // 13. Success → Login
  function handleGoLogin() {
    window.location.href = 'login.html';
  }

  // ============================================
  // Confetti Animation
  // ============================================
  function spawnConfetti() {
    const container = document.createElement('div');
    container.className = 'success-confetti';
    document.body.appendChild(container);

    const colors = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

    for (let i = 0; i < 50; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      piece.style.animationDelay = `${Math.random() * 0.5}s`;
      piece.style.animationDuration = `${1.5 + Math.random() * 2}s`;
      piece.style.width = `${6 + Math.random() * 8}px`;
      piece.style.height = `${6 + Math.random() * 8}px`;
      piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
      container.appendChild(piece);
    }

    setTimeout(() => container.remove(), 4000);
  }

  // ============================================
  // Event Listeners
  // ============================================
  function init() {
    // Registration form
    document.getElementById('register-form').addEventListener('submit', handleRegister);
    document.getElementById('reg-password').addEventListener('input', updatePasswordRequirements);
    initPasswordToggle();

    // Clear field errors on input
    ['reg-name', 'reg-email', 'reg-phone', 'reg-password'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', () => clearFieldError(id));
    });

    // Email OTP
    initOtpInputs('email-otp-inputs');
    document.getElementById('btn-verify-email').addEventListener('click', handleVerifyEmail);
    document.getElementById('email-resend-btn').addEventListener('click', handleResendEmail);

    // SMS OTP
    initOtpInputs('sms-otp-inputs');
    document.getElementById('btn-verify-sms').addEventListener('click', handleVerifySms);
    document.getElementById('sms-resend-btn').addEventListener('click', handleResendSms);

    // MFA
    initMfaOptions();
    document.getElementById('btn-mfa-continue').addEventListener('click', handleMfaContinue);
    document.getElementById('btn-mfa-qr-continue').addEventListener('click', handleMfaQrContinue);
    document.getElementById('btn-back-mfa').addEventListener('click', handleBackMfa);
    document.getElementById('btn-copy-key').addEventListener('click', handleCopyKey);

    // MFA Verify
    initOtpInputs('mfa-otp-inputs');
    document.getElementById('btn-verify-mfa').addEventListener('click', handleVerifyMfa);

    // Success
    document.getElementById('btn-go-login').addEventListener('click', handleGoLogin);

    // Show initial screen
    showScreen('screen-register');
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
