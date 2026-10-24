import nodemailer from 'nodemailer';
import env from '../config/env.js';
import { logger } from '../utils/logger.js';

// MAIL_TRANSPORT=smtp sends real email through your SMTP provider.
// MAIL_TRANSPORT=outbox keeps messages in memory only (used by tests and offline development).
// Nothing is delivered in outbox mode and the log says so explicitly.
export const outbox = [];

let transporter;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

export async function sendMail({ to, subject, text }) {
  if (env.MAIL_TRANSPORT === 'outbox') {
    outbox.push({ to, subject, text, at: new Date() });
    logger.warn({ to, subject }, 'mail NOT delivered: MAIL_TRANSPORT=outbox');
    return { delivered: false };
  }
  await getTransporter().sendMail({ from: env.MAIL_FROM, to, subject, text });
  return { delivered: true };
}

export const passwordResetEmail = (name, link) => ({
  subject: 'Reset your VP Mart password',
  text: `Hi ${name},\n\nUse the link below to reset your password. It expires in 30 minutes. If you did not request this, you can ignore this email.\n\n${link}\n`,
});
