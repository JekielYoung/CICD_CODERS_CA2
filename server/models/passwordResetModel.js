// server/models/passwordResetModel.js  YouJun
// SQL for the password_reset table.
const db = require('../db');

// Save a new reset request. Older unused requests for the same user stop working.
exports.create = async ({ userId, tokenHash, expiresAt }) => {
  await db.query(
    'UPDATE password_reset SET used_at = now() WHERE user_id = $1 AND used_at IS NULL',
    [userId]
  );
  await db.query(
    'INSERT INTO password_reset (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, tokenHash, expiresAt]
  );
};

// Use a reset token once: set the new password, burn the token and log out every
// old session, all in one transaction so it either fully happens or not at all.
// Returns true on success, false if the token is unknown, expired or already used.
exports.consumeAndSetPassword = async (tokenHash, newPasswordHash) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT reset_id, user_id FROM password_reset
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
       FOR UPDATE`,
      [tokenHash]
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return false;
    }

    const { reset_id: resetId, user_id: userId } = rows[0];
    await client.query(
      `UPDATE app_user
       SET password_hash = $1, token_version = token_version + 1
       WHERE user_id = $2`,
      [newPasswordHash, userId]
    );
    await client.query('UPDATE password_reset SET used_at = now() WHERE reset_id = $1', [resetId]);

    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};
