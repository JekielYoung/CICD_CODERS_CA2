// Author: Pyae Phyo Maung ( Luis )
// Student ID: 2535128
// Class: DIT/2B/02

// Handles error responses in one place.
// Internal error details are only logged on the server (REG-13).
function isDatabaseDown(err) {
  if (!err) return false;
  if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.code === 'ECONNRESET') return true;
  if (/^(08|57P0)/.test(err.code || '')) return true; // 08xxx connection exception, 57P0x server unavailable
  return /connection|timeout|terminated/i.test(err.message || '');
}

function serverError(res, err) {
  console.error(err);
  const down = isDatabaseDown(err);
  return res.status(down ? 503 : 500).json({
    error: down
      ? 'Service temporarily unavailable. Please try again.'
      : 'Something went wrong. Please try again.',
  });
}

module.exports = { isDatabaseDown, serverError };