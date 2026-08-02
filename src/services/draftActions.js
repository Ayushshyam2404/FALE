import Draft from '../models/Draft.js';
import Email from '../models/Email.js';
import { sendEmail } from './email/smtp.js';
import { setConversationState } from './conversation.js';
import { sendWhatsAppText, sendWhatsAppForEmail, formatSentConfirmation } from './whatsapp/notify.js';
import { logger } from './logging.js';
import env from '../config/env.js';

/**
 * Sends an approved draft via SMTP and updates related records.
 */
export async function sendApprovedDraft(draft, { notifyWhatsApp = true } = {}) {
  if (!['generated', 'approved'].includes(draft.status)) {
    throw new Error(`Draft cannot be sent from status ${draft.status}`);
  }

  const emailDoc = await Email.findById(draft.emailId);
  if (!emailDoc || !emailDoc.from?.address) {
    throw new Error('Original sender address is missing');
  }

  const signature = draft.signature || env.SIGNATURE || env.SENDER_NAME;
  const fullBody = draft.body ? `${draft.body}\n\n${signature}`.trim() : signature;

  const info = await sendEmail({
    to: emailDoc.from.address,
    subject: draft.subject,
    text: fullBody,
    attachments: draft.attachments || [],
    inReplyTo: emailDoc.messageId,
    references: emailDoc.messageId,
  });

  draft.status = 'sent';
  draft.sentAt = new Date();
  await draft.save();

  emailDoc.status = 'sent';
  await emailDoc.save();
  await setConversationState(draft.conversationId, 'sent');

  if (notifyWhatsApp) {
    await sendWhatsAppForEmail(
      env.WHATSAPP.RECIPIENT,
      formatSentConfirmation({ draft, emailDoc }),
      { emailId: emailDoc._id, type: 'sent_confirmation' },
    ).catch(() => {});
  }

  logger.info('draft.sent', `Reply sent to ${emailDoc.from.address}`, {
    draftId: draft._id,
    smtpMessageId: info.messageId,
  });

  return { status: 'sent', draftId: draft._id, smtpMessageId: info.messageId, emailDoc };
}

/**
 * Cancels a pending draft and reverts the linked email to notified.
 */
export async function cancelPendingDraft(draft, { notifyWhatsApp = true } = {}) {
  draft.status = 'cancelled';
  await draft.save();

  const emailDoc = await Email.findById(draft.emailId);
  if (emailDoc && emailDoc.status === 'awaiting_approval') {
    emailDoc.status = 'notified';
    await emailDoc.save();
  }
  await setConversationState(draft.conversationId, 'cancelled');

  if (notifyWhatsApp) {
    await sendWhatsAppText(
      env.WHATSAPP.RECIPIENT,
      'Draft discarded. No email was sent.',
    ).catch(() => {});
  }

  logger.info('draft.cancelled', 'Draft cancelled', { draftId: draft._id });
  return { status: 'cancelled', draftId: draft._id };
}
