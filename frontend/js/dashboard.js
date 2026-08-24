(function () {
  'use strict';

  const API_BASE = (() => {
    if (window.API_BASE_URL) return window.API_BASE_URL;
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      if (window.location.port === '5500') return 'http://localhost:3000/api';
    }
    return `${window.location.origin}/api`;
  })();

  async function loadDashboard() {
    const token = sessionStorage.getItem('secureid_token');

    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(`${API_BASE}/me`, {
        method: 'GET',
        headers,
        credentials: 'include',
      });

      if (response.status === 401) {
        if (token) {
          const dashRes = await fetch(`${API_BASE}/dashboard`, {
            method: 'GET',
            headers,
            credentials: 'include',
          });
          if (dashRes.ok) {
            const data = await dashRes.json();
            renderUser(data.user);
            return;
          }
        }
        sessionStorage.removeItem('secureid_token');
        window.location.href = 'login.html';
        return;
      }

      const data = await response.json();

      if (data.success && data.user) {
        renderUser(data.user);
      }
    } catch (err) {
      console.error('Error loading dashboard:', err);
    }
  }

  function renderUser(user) {
    if (!user) return;

    document.getElementById('user-name').textContent = user.name || 'User';
    document.getElementById('user-email').textContent = user.email || '';

    const initials = (user.name || 'ID')
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
    document.getElementById('avatar-initials').textContent = initials || 'ID';

    document.getElementById('detail-phone').textContent = user.phone || '--';
    document.getElementById('detail-status').textContent =
      user.registrationStatus === 'complete' ? 'Active / Complete' : user.registrationStatus;

    if (user.createdAt) {
      const date = new Date(user.createdAt);
      document.getElementById('detail-created').textContent = date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    }

    document.getElementById('badge-email').textContent = user.emailVerified ? 'Verified' : 'Pending';
    document.getElementById('badge-phone').textContent = user.phoneVerified ? 'Verified' : 'Pending';
    document.getElementById('badge-mfa').textContent = user.mfaEnabled ? 'Active' : 'Disabled';
  }

  async function handleLogout() {
    try {
      await fetch(`${API_BASE}/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
    } catch (e) {
    }

    sessionStorage.removeItem('secureid_token');
    window.location.href = 'login.html';
  }

  document.addEventListener('DOMContentLoaded', () => {
    loadDashboard();
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', handleLogout);
    }
  });
})();
