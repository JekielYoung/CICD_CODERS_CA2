// server/services/mailer.js   YouJun
// Sends the password reset email.

exports.sendResetEmail = async (to, resetUrl) => {
  if (!process.env.SMTP_HOST) {
    if (process.env.NODE_ENV !== 'test') {
      console.log(`\n[mailer] Password reset link for ${to}:\n${resetUrl}\n`);
    }
    return;
  }

  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });

  await transporter.sendMail({
    from: process.env.MAIL_FROM || 'Orbit <no-reply@orbit.local>',
    to,
    subject: 'Reset your Orbit password',
    text: `Use this link to choose a new password (valid for 1 hour):\n${resetUrl}\n\nIf you did not ask for this, ignore this email.`,
  });
};
