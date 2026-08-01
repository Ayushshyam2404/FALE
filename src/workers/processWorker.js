import fs from 'node:fs/promises';
import Email from '../models/Email.js';
import { parseEmail } from '../services/email/parser.js';
import { classifyEmail } from '../services/ai/classify.js';
import { shouldIgnore } from '../services/ai/filters.js';
import {
  resolveConversation,
  setConversationState,
} from '../services/conversation.js';
import {
  sendWhatsAppText,
  formatEmailNotification,
} from '../services/whatsapp/notify.js';
import { logger } from '../services/logging.js';
import env from '../config/env.js';

export async function processEmail(job) {
  const { uid, filePath } = job.data;
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = await parseEmail(raw, { uid });

  const existing = await Email.findOne({ messageId: parsed.messageId });
  if (existing) {
    logger.info('email.duplicate', `Duplicate email skipped: ${parsed.messageId}`);
    return { status: 'duplicate', messageId: parsed.messageId };
  }

  const emailDoc = await Email.create({
    ...parsed,
    status: 'processed',
  });

  const conversation = await resolveConversation(emailDoc);

  let classification;
  try {
    classification = await classifyEmail(parsed);
  } catch (err) {
    logger.error('ai.classify_failed', err.message, { messageId: parsed.messageId });
    emailDoc.status = 'failed';
    await emailDoc.save();
    throw err;
  }

  emailDoc.category = classification.category;
  emailDoc.priority = classification.priority;
  emailDoc.action = classification.action;
  emailDoc.importance = classification.importance;
  emailDoc.summary = classification.summary;
  emailDoc.suggestedAction = classification.suggestedAction;

  const filtered = shouldIgnore(parsed, classification.category);
  if (filtered.ignore) {
    emailDoc.status = 'ignored';
    await emailDoc.save();
    logger.info('email.ignored', `Ignored email (${filtered.reason}): ${parsed.subject}`);
    return { status: 'ignored', reason: filtered.reason, messageId: parsed.messageId };
  }

  const needsAttention =
    classification.action === 'Needs Reply' ||
    classification.priority === 'Critical' ||
    classification.importance;

  if (needsAttention) {
    emailDoc.status = 'notified';
    await emailDoc.save();
    await sendWhatsAppText(env.WHATSAPP.RECIPIENT, formatEmailNotification(emailDoc));
    await setConversationState(conversation._id, 'notified');
    logger.info('email.notified', `Notified via WhatsApp: ${parsed.subject}`, {
      messageId: parsed.messageId,
    });
    return { status: 'notified', messageId: parsed.messageId };
  }

  emailDoc.status = 'archived';
  await emailDoc.save();
  logger.info('email.archived', `Archived informational email: ${parsed.subject}`, {
    messageId: parsed.messageId,
  });
  return { status: 'archived', messageId: parsed.messageId };
}
