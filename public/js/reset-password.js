// public/js/reset-password.js  (You Jun)
// Opened from the email link: reset-password.html?token=...
import { api } from './shared/api.js';

const form = document.getElementById('reset-form');
const passwordInput = document.getElementById('password');
const confirmInput = document.getElementById('confirm');
const submitBtn = document.getElementById('submit-btn');
const alertBox = document.getElementById('form-alert');
const successBox = document.getElementById('success-alert');
const backLink = document.getElementById('back-link');

const token = new URLSearchParams(window.location.search).get('token') || '';

function fieldError(input, message) {
  input.classList.add('is-invalid');
  const box = input.parentElement.querySelector('.invalid-feedback');
  if (box) box.textContent = message;
}
function showAlert(message) {
  alertBox.textContent = message;
  alertBox.hidden = false;
}

// No token in the link, or it is clearly not one of ours
if (!/^[0-9a-f]{64}$/.test(token)) {
  showAlert('This reset link is invalid. Please request a new one.');
  form.hidden = true;
  backLink.textContent = 'Request a new link';
  backLink.href = 'forgot-password.html';
}

document.getElementById('toggle-password').addEventListener('click', (e) => {
  const showing = passwordInput.type === 'text';
  passwordInput.type = showing ? 'password' : 'text';
  e.currentTarget.textContent = showing ? 'Show' : 'Hide';
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  form.querySelectorAll('.is-invalid').forEach((el) => el.classList.remove('is-invalid'));
  alertBox.hidden = true;

  const password = passwordInput.value;
  let ok = true;
  if (!password) { fieldError(passwordInput, 'Enter a new password.'); ok = false; }
  else if (password.length < 8) { fieldError(passwordInput, 'Password must be at least 8 characters.'); ok = false; }
  else if (!/\d/.test(password)) { fieldError(passwordInput, 'Password must include a number.'); ok = false; }
  if (confirmInput.value !== password) { fieldError(confirmInput, 'The passwords do not match.'); ok = false; }
  if (!ok) return;

  submitBtn.disabled = true;
  submitBtn.textContent = 'Updating...';
  try {
    const data = await api('/auth/reset-password', {
      method: 'POST',
      body: { token, password },
      redirectOn401: false,
    });
    form.hidden = true;
    successBox.textContent = data.message;
    successBox.hidden = false;
    backLink.textContent = 'Go to log in →';
  } catch (err) {
    if (err.field === 'password') fieldError(passwordInput, err.message);
    else showAlert(err.message); // invalid or expired link, server down...
    submitBtn.disabled = false;
    submitBtn.textContent = 'Update password';
  }
});
