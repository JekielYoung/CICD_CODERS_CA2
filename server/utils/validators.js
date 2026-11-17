// server/utils/validators.js YouJun
// Input rules shared by register, login and reset-password.

const LIMITS = {
  nameMax: 100,
  emailMax: 254,
  passwordMin: 8,
  passwordMax: 72, // bcrypt only uses the first 72 bytes
};

// Trim spaces and lowercase, so " John@Example.COM " and "john@example.com" are one account
function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function isValidEmail(email) {
  return (
    typeof email === 'string' &&
    email.length > 0 &&
    email.length <= LIMITS.emailMax &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  );
}

// Returns an error message, or null when the name is fine
function checkName(name) {
  if (typeof name !== 'string' || name.trim() === '') return 'Name is required.';
  if (name.trim().length > LIMITS.nameMax) return `Name must be at most ${LIMITS.nameMax} characters.`;
  return null;
}

// Rule from the wireframe: at least 8 characters, with a number
function checkPassword(password) {
  if (typeof password !== 'string' || password === '') return 'Password is required.';
  if (password.length < LIMITS.passwordMin) return `Password must be at least ${LIMITS.passwordMin} characters.`;
  if (Buffer.byteLength(password, 'utf8') > LIMITS.passwordMax) return `Password must be at most ${LIMITS.passwordMax} characters.`;
  if (!/\d/.test(password)) return 'Password must include a number.';
  return null;
}

module.exports = { LIMITS, normalizeEmail, isValidEmail, checkName, checkPassword };
