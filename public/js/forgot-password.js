// public/js/forgot-password.js  (You Jun)
import { api } from './shared/api.js';

const form = document.getElementById('forgot-form');
const emailInput = document.getElementById('email');
const submitBtn = document.getElementById('submit-btn');
const alertBox = document.getElementById('form-alert');
const successBox = document.getElementById('success-alert');

function fieldError(input, message) {
  input.classList.add('is-invalid');
  const box = input.parentElement.querySelector('.invalid-feedback');
  if (box) box.textContent = message;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  emailInput.classList.remove('is-invalid');
  alertBox.hidden = true;
  successBox.hidden = true;

  const email = emailInput.value.trim();
  if (!email) return fieldError(emailInput, 'Enter your email.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fieldError(emailInput, 'Enter a valid email address.');

  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending...';
  try {
    const data = await api('/auth/forgot-password', { method: 'POST', body: { email }, redirectOn401: false });
    // The server gives the same message whether or not the email has an account
    successBox.textContent = data.message;
    successBox.hidden = false;
    submitBtn.textContent = 'Link sent';
    // allow another try after a short wait
    setTimeout(() => {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send reset link';
    }, 10000);
  } catch (err) {
    alertBox.textContent = err.message; // too many requests (429), server down...
    alertBox.hidden = false;
    submitBtn.disabled = false;
    submitBtn.textContent = 'Send reset link';
  }
});
