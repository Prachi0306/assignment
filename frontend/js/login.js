/**
 * SecureID – Login Journey (Vanilla JS)
 */

(function () {
  'use strict';

  const API_BASE = window.location.origin.includes('localhost:3000')
    ? 'http://localhost:3000/api'
    : `${window.location.origin}/api`;

  const state = {
    userId: null,
    email: '',
  };

  function showScreen(screenId) {
    const screens = ['screen-login', 'screen-login-mfa'];
    screens.forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        if (id === screenId) {
          el.classList.remove('hidden');
          el.style.animation = 'none';
          el.offsetHeight; // Reflow
          el.style.animation = '';
        } else {
          el.classList.add('hidden');
        }
      }
    });
  }

  async function apiCall(endpoint, method = 'POST', body = null) {
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    };
    if (body) options.body = JSON.stringify(body);

    const response = await fetch(`${API_BASE}${endpoint}`, options);
    const data = await response.json();
    return { status: response.status, ...data };
  }

  function showAlert(containerId, type, message) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const iconSvg =
      type === 'error'
        ? '<svg class="alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
        : '<svg class="alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';

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

  function setButtonLoading(btnId, loading) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    if (loading) {
      btn.dataset.originalText = btn.innerHTML;
      btn.innerHTML = '<span class="spinner"></span> Signing in...';
      btn.disabled = true;
    } else {
      btn.innerHTML = btn.dataset.originalText || btn.innerHTML;
      btn.disabled = false;
    }
  }

  function initPasswordToggle() {
    const toggleBtn = document.getElementById('toggle-password');
    const passwordInput = document.getElementById('login-password');
    const eyeIcon = document.getElementById('eye-icon');
    const eyeOffIcon = document.getElementById('eye-off-icon');

    if (toggleBtn && passwordInput) {
      toggleBtn.addEventListener('click', () => {
        const isPassword = passwordInput.type === 'password';
        passwordInput.type = isPassword ? 'text' : 'password';
        eyeIcon.classList.toggle('hidden');
        eyeOffIcon.classList.toggle('hidden');
      });
    }
  }

  function initOtpInputs(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const inputs = container.querySelectorAll('.otp-input');

    inputs.forEach((input, index) => {
      input.addEventListener('input', (e) => {
        const value = e.target.value.replace(/[^0-9]/g, '');
        e.target.value = value;
        if (value && index < inputs.length - 1) {
          inputs[index + 1].focus();
        }
        inputs.forEach((inp) => inp.classList.remove('error'));
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !e.target.value && index > 0) {
          inputs[index - 1].focus();
          inputs[index - 1].value = '';
        }
      });

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

  // Handle Login Form Submit
  async function handleLogin(e) {
    e.preventDefault();
    hideAlert('login-alert');

    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    if (!email || !password) {
      showAlert('login-alert', 'error', 'Please enter your email and password.');
      return;
    }

    setButtonLoading('btn-login', true);

    try {
      const result = await apiCall('/login', 'POST', { email, password });

      if (result.success) {
        if (result.mfaRequired) {
          state.userId = result.userId;
          state.email = email;
          showScreen('screen-login-mfa');
          clearOtpInputs('login-mfa-inputs');

          // Fetch test TOTP for easy testing
          try {
            const res = await fetch(`${API_BASE}/test/mfa-otp`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: state.userId }),
            });
            if (res.ok) {
              const data = await res.json();
              if (data.success && data.otp) {
                const alertEl = document.getElementById('login-mfa-alert');
                if (alertEl) {
                  alertEl.className = 'dev-simulated-banner';
                  alertEl.innerHTML = `
                    <div>
                      <span class="dev-badge">Simulated MFA TOTP</span>
                      <span>Code: <strong class="dev-code">${data.otp}</strong></span>
                    </div>
                    <button type="button" class="btn-autofill" id="btn-fill-login-mfa">Auto-fill</button>
                  `;
                  alertEl.classList.remove('hidden');
                  const btn = document.getElementById('btn-fill-login-mfa');
                  if (btn) {
                    btn.onclick = () => {
                      const inputs = document.querySelectorAll('#login-mfa-inputs .otp-input');
                      inputs.forEach((inp, i) => {
                        inp.value = data.otp[i] || '';
                        inp.classList.remove('error');
                      });
                      if (inputs[5]) inputs[5].focus();
                    };
                  }
                }
              }
            }
          } catch (e) {}
        } else if (result.token) {
          // Store token in sessionStorage (not localStorage)
          sessionStorage.setItem('secureid_token', result.token);
          window.location.href = 'dashboard.html';
        }
      } else {
        showAlert('login-alert', 'error', result.message || 'Invalid credentials.');
      }
    } catch (err) {
      showAlert('login-alert', 'error', 'Unable to connect to the server. Please try again.');
    } finally {
      setButtonLoading('btn-login', false);
    }
  }

  // Handle MFA Verification Submit
  async function handleVerifyLoginMfa() {
    hideAlert('login-mfa-alert');
    const otp = getOtpValue('login-mfa-inputs');

    if (otp.length !== 6) {
      showAlert('login-mfa-alert', 'error', 'Please enter the full 6-digit code.');
      setOtpError('login-mfa-inputs');
      return;
    }

    setButtonLoading('btn-verify-login-mfa', true);

    try {
      const result = await apiCall('/login/verify-mfa', 'POST', {
        userId: state.userId,
        otp,
      });

      if (result.success && result.token) {
        // Store token in sessionStorage
        sessionStorage.setItem('secureid_token', result.token);
        window.location.href = 'dashboard.html';
      } else {
        setOtpError('login-mfa-inputs');
        showAlert('login-mfa-alert', 'error', result.message || 'Invalid code.');
      }
    } catch (err) {
      showAlert('login-mfa-alert', 'error', 'Unable to verify code.');
    } finally {
      setButtonLoading('btn-verify-login-mfa', false);
    }
  }

  function init() {
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    initPasswordToggle();
    initOtpInputs('login-mfa-inputs');
    document.getElementById('btn-verify-login-mfa').addEventListener('click', handleVerifyLoginMfa);
    document.getElementById('btn-back-login').addEventListener('click', () => showScreen('screen-login'));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
