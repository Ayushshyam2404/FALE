import nodemailer from 'nodemailer';
import env from '../../config/env.js';
import { logger } from '../logging.js';

let transporter = null;

export function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP.HOST,
      port: env.SMTP.PORT,
      secure: env.SMTP.SECURE,
      auth: { user: env.SMTP.USER, pass: env.SMTP.PASSWORD },
    });
  }
  return transporter;
}

/**
 * @param {{ to: string, subject: string, text: string, html?: string,
 *   attachments?: Array<{filename:string,path:string,contentType?:string}>,
 *   inReplyTo?: string, references?: string }} params
 */
export async function sendEmail({ to, subject, text, html, attachments = [], inReplyTo, references }) {
  const mail = {
    from: { name: env.SENDER_NAME, address: env.SMTP.USER },
    to,
    subject,
    text,
    attachments: (attachments || [])
      .filter((a) => a && a.path)
      .map((a) => ({ filename: a.filename, path: a.path, contentType: a.contentType })),
  };

  if (html) mail.html = html;
  if (inReplyTo) mail.inReplyTo = inReplyTo;
  if (references) mail.references = references;

  const info = await getTransporter().sendMail(mail);
  logger.info('smtp.sent', `Email sent to ${to}`, { smtpMessageId: info.messageId, subject });
  return info;
}

export async function verifySmtp() {
  return getTransporter().verify();
}
