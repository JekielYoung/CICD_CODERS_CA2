// public/js/shared/auth-check.js
// Loaded in the <head> of pages that need a logged-in user.
// No token at all -> go to the login page before the page shows.
// A token that is expired or revoked is caught later by api.js (the server answers 401).
import { auth } from './api.js';

if (!auth.get()) window.location.replace('/login.html');