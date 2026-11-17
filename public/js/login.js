// public/js/login.js  (You Jun)
import { api, auth } from './shared/api.js';

// Already logged in? Go straight to Home.
if (auth.get()) window.location.replace('home.html');

const form = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const keepInput = document.getElementById('keep');
const submitBtn = document.getElementById('submit-btn');
const alertBox = document.getElementById('form-alert');

// ---- small helpers for showing errors with Bootstrap's is-invalid ----
function fieldError(input, message) {
  input.classList.add('is-invalid');
  const box = input.parentElement.querySelector('.invalid-feedback');
  if (box) box.textContent = message;
}
function clearErrors() {
  form.querySelectorAll('.is-invalid').forEach((el) => el.classList.remove('is-invalid'));
  alertBox.hidden = true;
}
function showAlert(message) {
  alertBox.textContent = message;
  alertBox.hidden = false;
}

// Show / Hide password
document.getElementById('toggle-password').addEventListener('click', (e) => {
  const showing = passwordInput.type === 'text';
  passwordInput.type = showing ? 'password' : 'text';
  e.currentTarget.textContent = showing ? 'Show' : 'Hide';
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErrors();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  // Check the empty fields here so the user gets instant feedback (LOG-04, LOG-05)
  let ok = true;
  if (!email) { fieldError(emailInput, 'Enter your email.'); ok = false; }
  if (!password) { fieldError(passwordInput, 'Enter your password.'); ok = false; }
  if (!ok) return;

  submitBtn.disabled = true;
  submitBtn.textContent = 'Logging in...';
  try {
    const data = await api('/auth/login', {
      method: 'POST',
      body: { email, password, keepLoggedIn: keepInput.checked },
      redirectOn401: false, // a 401 here just means wrong email or password
    }
);
    auth.set(data.token);
    window.location.href = 'home.html';
  } catch (err) {
    if (err.status === 400 && err.field === 'email') fieldError(emailInput, err.message);
    else if (err.status === 400 && err.field === 'password') fieldError(passwordInput, err.message);
    else showAlert(err.message); // wrong password (401), too many attempts (429), server down...
    submitBtn.disabled = false;
    submitBtn.textContent = 'Log in';
  }
});
