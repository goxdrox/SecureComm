// server/utils/sendEmail.js

const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendMagicLinkEmail(to, token) {
  const magicLink = `securecomm://auth/${token}`;

  const { error } = await resend.emails.send({
    from: 'SecureComm <faradome@oddgenetics.com>',
    to,
    subject: 'Your SecureComm Magic Login Link',
    html: `
      <h2>Welcome to SecureComm</h2>
      <p>Click the link below to log in securely:</p>
      <a href="${magicLink}">${magicLink}</a>
      <p>If you're on mobile, your app should open automatically.</p>
    `
  });

  if (error) {
    console.error('Failed to send email:', error);
    throw new Error('Email failed to send');
  }
}

module.exports = sendMagicLinkEmail;
