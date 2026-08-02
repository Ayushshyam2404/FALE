import env from '../../config/env.js';
import { sendWhatsAppText } from './provider.js';
import { emailThreadRef, linkWhatsAppMessage } from './threadLink.js';

export { sendWhatsAppText };

function waMessageIdFromResult(result) {
  return result?.key?.id || result?.messages?.[0]?.id || null;
}

/**
 * Sends a WhatsApp message and links it to an email/draft thread for reply routing.
 */
export async function sendWhatsAppForEmail(to, text, { emailId, draftId, type = 'notification' } = {}) {
  const result = await sendWhatsAppText(to, text);
  const waMessageId = waMessageIdFromResult(result);
  if (waMessageId) {
    await linkWhatsAppMessage(waMessageId, { emailId, draftId, type });
  }
  return result;
}

export function formatEmailNotification(email) {
  const ref = emailThreadRef(email);
  const from = email.from?.name ? `${email.from.name} <${email.from.address}>` : (email.from?.address || 'unknown');
  const preview = String(email.bodyText || '').trim().split('\n').find((l) => l.trim())?.slice(0, 120) || '';
  const question = email.replyQuestion || '';
  return [
    `[Thread ${ref}] New Email: ${email.subject || '(no subject)'}`,
    '',
    `Priority: ${email.priority || 'N/A'}`,
    `Category: ${email.category || 'N/A'}`,
    `From: ${from}`,
    question ? `Needs answer: ${question}` : preview ? `They wrote: "${preview}${preview.length >= 120 ? '…' : ''}"` : '',
    '',
    `Summary: ${email.summary || ''}`,
    '',
    'Swipe-reply with your answer (sends automatically), or /send <message>.',
    'Type STATUS anytime to see all open threads.',
  ].join('\n');
}

export function formatDraft(draft, emailDoc) {
  const ref = emailDoc ? emailThreadRef(emailDoc) : null;
  const signature = draft.signature || env.SIGNATURE || env.SENDER_NAME;
  const header = ref ? `[Thread ${ref}] Draft ready for your review` : 'Draft ready for your review';
  return [
    header,
    '',
    `Subject: ${draft.subject || ''}`,
    '',
    draft.body || '',
    '',
    `Signature: ${signature}`,
    '',
    'Swipe-reply SEND to send, EDIT <instructions> to revise, CANCEL to discard.',
  ].join('\n');
}

export function formatSentConfirmation({ draft, emailDoc }) {
  const ref = emailDoc ? emailThreadRef(emailDoc) : null;
  const signature = draft.signature || env.SIGNATURE || env.SENDER_NAME;
  const to = emailDoc?.from?.name
    ? `${emailDoc.from.name} <${emailDoc.from.address}>`
    : (emailDoc?.from?.address || 'unknown');
  const header = ref ? `[Thread ${ref}] Email sent` : 'Email sent';
  return [
    header,
    '',
    `To: ${to}`,
    `Subject: ${draft.subject || ''}`,
    '',
    draft.body || '',
    '',
    signature,
  ].join('\n');
}

export function formatPendingList(emails) {
  if (!emails.length) {
    return 'No open email threads. Falcon is idle.';
  }
  const lines = [`Open threads (${emails.length}):`, ''];
  for (const e of emails) {
    const ref = emailThreadRef(e);
    const from = e.from?.name || e.from?.address || 'unknown';
    const q = e.replyQuestion || e.subject || '(no subject)';
    lines.push(`[${ref}] ${from}`);
    lines.push(`  ${q.slice(0, 80)}${q.length > 80 ? '…' : ''}`);
    lines.push('');
  }
  lines.push('Swipe-reply to a notification to answer that thread.');
  return lines.join('\n');
}
