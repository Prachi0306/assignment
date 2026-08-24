/**
 * SecureID – Dashboard Logic (Vanilla JS)
 */

(function () {
  'use strict';

  const API_BASE = window.location.origin.includes('localhost:3000')
    ? 'http://localhost:3000/api'
    : `${window.location.origin}/api`;

  async function loadDashboard() {
    const token = sessionStorage.getItem('secureid_token');

    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      // First try /api/me (session cookie), falls back to /api/dashboard
      const response = await fetch(`${API_BASE}/me`, {
        method: 'GET',
        headers,
        credentials: 'include', // Include httpOnly session cookie
      });

      if (response.status === 401) {
        // Try /api/dashboard with Bearer token if /me rejected cookie
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

    // Render user info
    document.getElementById('user-name').textContent = user.name || 'User';
    document.getElementById('user-email').textContent = user.email || '';

    // Initials
    const initials = (user.name || 'ID')
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
    document.getElementById('avatar-initials').textContent = initials || 'ID';

    // Account details
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

    // Badges
    document.getElementById('badge-email').textContent = user.emailVerified ? 'Verified' : 'Pending';
    document.getElementById('badge-phone').textContent = user.phoneVerified ? 'Verified' : 'Pending';
    document.getElementById('badge-mfa').textContent = user.mfaEnabled ? 'Active' : 'Disabled';
  }

  async function handleLogout() {
    try {
      await fetch(`${API_BASE}/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Clear server session cookie
      });
    } catch (e) {
      // Continue cleanup on frontend
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
