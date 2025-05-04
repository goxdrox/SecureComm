// server/utils/sendEmail.js

const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

async function sendVerificationCodeEmail(to, code) {
  const html = `
    <p>Welcome to SecureComm!</p>
    <p>Your verification code is:</p>
    <h2 style="font-family: monospace; letter-spacing: 2px;">${code}</h2>
    <p>This code expires in 10 minutes.</p>
    <p>If you did not request this, you can ignore this email.</p>
  `;

  const { error } = await resend.emails.send({
    from: 'SecureComm <no-reply@oddgenetics.com>',
    to,
    subject: 'Your SecureComm Verification Code',
    html,
  });

  if (error) {
    console.error('Failed to send email:', error);
    throw new Error('Email failed to send');
  }
}

module.exports = sendVerificationCodeEmail;
