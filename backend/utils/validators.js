function validateName(name) {
  if (!name || typeof name !== 'string') {
    return 'Full name is required.';
  }
  const trimmed = name.trim();
  if (trimmed.length < 2) {
    return 'Name must be at least 2 characters.';
  }
  if (trimmed.length > 100) {
    return 'Name must not exceed 100 characters.';
  }
  return null;
}

function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return 'Email is required.';
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    return 'Please provide a valid email address.';
  }
  return null;
}

function validatePhone(phone) {
  if (!phone || typeof phone !== 'string') {
    return 'Mobile number is required.';
  }
  const phoneRegex = /^\+?[1-9]\d{6,14}$/;
  if (!phoneRegex.test(phone.trim().replace(/[\s\-()]/g, ''))) {
    return 'Please provide a valid mobile number.';
  }
  return null;
}

function validatePassword(password) {
  const errors = [];

  if (!password || typeof password !== 'string') {
    return ['Password is required.'];
  }

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters.');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least 1 uppercase letter.');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least 1 number.');
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password)) {
    errors.push('Password must contain at least 1 special character.');
  }

  return errors.length > 0 ? errors : null;
}

function validateRegistration(data) {
  const errors = {};

  const nameErr = validateName(data.name);
  if (nameErr) errors.name = nameErr;

  const emailErr = validateEmail(data.email);
  if (emailErr) errors.email = emailErr;

  const phoneErr = validatePhone(data.phone);
  if (phoneErr) errors.phone = phoneErr;

  const passErrs = validatePassword(data.password);
  if (passErrs) errors.password = passErrs;

  if (!data.termsAccepted) {
    errors.terms = 'You must accept the Terms & Conditions.';
  }

  if (!data.privacyAccepted) {
    errors.privacy = 'You must accept the Privacy Policy.';
  }

  return Object.keys(errors).length > 0 ? errors : null;
}

module.exports = {
  validateName,
  validateEmail,
  validatePhone,
  validatePassword,
  validateRegistration,
};
