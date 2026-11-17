// public/js/register.js  (You Jun)
import { api, auth } from './shared/api.js';

if (auth.get()) window.location.replace('home.html');

const form = document.getElementById('register-form');
const nameInput = document.getElementById('name');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const termsInput = document.getElementById('terms');
const submitBtn = document.getElementById('submit-btn');
const alertBox = document.getElementById('form-alert');
const strengthBar = document.getElementById('strength');
const strengthText = document.getElementById('strength-text');

// ---- helpers ----
function fieldError(input, message) {
  input.classList.add('is-invalid');
  const box = input.parentElement.querySelector('.invalid-feedback');
  if (box && message) box.textContent = message;
}
function clearErrors() {
  form.querySelectorAll('.is-invalid').forEach((el) => el.classList.remove('is-invalid'));
  alertBox.hidden = true;
}
function showAlert(message) {
  alertBox.textContent = message;
  alertBox.hidden = false;
}

// Same rules as the server (server/utils/validators.js). The server still checks everything.
function passwordProblem(password) {
  if (!password) return 'Enter a password.';
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (new TextEncoder().encode(password).length > 72) return 'Password must be at most 72 characters.';
  if (!/\d/.test(password)) return 'Password must include a number.';
  return null;
}

// Show / Hide password
document.getElementById('toggle-password').addEventListener('click', (e) => {
  const showing = passwordInput.type === 'text';
  passwordInput.type = showing ? 'password' : 'text';
  e.currentTarget.textContent = showing ? 'Show' : 'Hide';
});

// Strength meter: 1 point each for length 8+, length 12+, a number, upper + lower or a symbol
passwordInput.addEventListener('input', () => {
  const p = passwordInput.value;
  let level = 0;
  if (p.length >= 8) level++;
  if (p.length >= 12) level++;
  if (/\d/.test(p)) level++;
  if ((/[a-z]/.test(p) && /[A-Z]/.test(p)) || /[^A-Za-z0-9]/.test(p)) level++;
  if (p.length < 8) level = Math.min(level, 1);
  if (!p) level = 0;

  strengthBar.dataset.level = level;
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  strengthText.textContent = p
    ? `At least 8 characters, with a number. Strength: ${labels[level].toLowerCase()}.`
    : 'At least 8 characters, with a number.';
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErrors();

  const name = nameInput.value.trim();
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  let ok = true;
  if (!name) { fieldError(nameInput, 'Enter your full name.'); ok = false; }
  else if (name.length > 100) { fieldError(nameInput, 'Name must be at most 100 characters.'); ok = false; }

  if (!email) { fieldError(emailInput, 'Enter your email.'); ok = false; }
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { fieldError(emailInput, 'Enter a valid email address.'); ok = false; }

  const pwProblem = passwordProblem(password);
  if (pwProblem) { fieldError(passwordInput, pwProblem); ok = false; }

  if (!termsInput.checked) { termsInput.classList.add('is-invalid'); ok = false; }
  if (!ok) return;

  submitBtn.disabled = true;
  submitBtn.textContent = 'Creating account...';
  try {
    const data = await api('/auth/register', {
      method: 'POST',
      body: { name, email, password },
      redirectOn401: false,
    });
    auth.set(data.token); // the new user is logged in straight away
    window.location.href = 'home.html';
  } catch (err) {
    const inputs = { name: nameInput, email: emailInput, password: passwordInput };
    if (inputs[err.field]) fieldError(inputs[err.field], err.message); // e.g. 409: email already used
    else showAlert(err.message);
    submitBtn.disabled = false;
    submitBtn.textContent = 'Create account';
  }
});
