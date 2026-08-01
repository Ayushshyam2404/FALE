import env from '../../config/env.js';
import { sendWhatsAppText } from './provider.js';

export { sendWhatsAppText };

export function formatEmailNotification(email) {
  const from = email.from?.name ? `${email.from.name} <${email.from.address}>` : (email.from?.address || 'unknown');
  return [
    `New Email: ${email.subject || '(no subject)'}`,
    '',
    `Priority: ${email.priority || 'N/A'}`,
    `Category: ${email.category || 'N/A'}`,
    `From: ${from}`,
    '',
    `Summary: ${email.summary || ''}`,
    '',
    `Suggested Action: ${email.suggestedAction || ''}`,
    '',
    'Reply /send <your message> to reply, SEND to send a pending draft, or CANCEL.',
  ].join('\n');
}

export function formatDraft(draft) {
  const signature = draft.signature || env.SIGNATURE || env.SENDER_NAME;
  return [
    'Draft ready for your review',
    '',
    `Subject: ${draft.subject || ''}`,
    '',
    draft.body || '',
    '',
    `Signature: ${signature}`,
    '',
    'SEND it? Reply SEND to send, EDIT <new instructions> to revise, CANCEL to discard.',
  ].join('\n');
}
