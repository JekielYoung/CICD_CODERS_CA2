// server/models/userModel.js  YouJun
// All SQL for the app_user table. Every value goes through $1, $2 placeholders,
// never pasted into the query text (this is what stops SQL injection: REG-11, LOG-07).
const db = require('../db');

// The table's primary key is user_id; "user_id AS id" lets the rest of the code just say user.id
exports.findByEmail = async (email) => {
  const { rows } = await db.query(
    `SELECT user_id AS id, name, email, password_hash, token_version
     FROM app_user WHERE LOWER(email) = LOWER($1)`,
    [email]
  );
  return rows[0];
};

exports.findById = async (id) => {
  const { rows } = await db.query(
    'SELECT user_id AS id, name, email, token_version FROM app_user WHERE user_id = $1',
    [id]
  );
  return rows[0];
};

exports.create = async ({ name, email, passwordHash }) => {
  const { rows } = await db.query(
    `INSERT INTO app_user (name, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING user_id AS id, name, email, token_version`,
    [name, email, passwordHash]
  );
  return rows[0];
};

// Logging out: every token issued before this moment stops working (LOG-11)
exports.bumpTokenVersion = async (id) => {
  await db.query('UPDATE app_user SET token_version = token_version + 1 WHERE user_id = $1', [id]);
};
