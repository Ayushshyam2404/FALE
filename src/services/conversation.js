import Email from '../models/Email.js';
import Conversation from '../models/Conversation.js';
import Draft from '../models/Draft.js';

export async function resolveConversation(emailDoc) {
  let conversation = await Conversation.findOne({ threadId: emailDoc.threadId });

  if (!conversation) {
    conversation = await Conversation.create({
      threadId: emailDoc.threadId,
      subject: emailDoc.subject,
    });
  }

  conversation.subject = emailDoc.subject || conversation.subject;

  const participants = new Set(conversation.participants || []);
  if (emailDoc.from?.address) participants.add(emailDoc.from.address);
  for (const r of emailDoc.recipients || []) {
    if (r.address) participants.add(r.address);
  }
  conversation.participants = [...participants].filter(Boolean);

  conversation.emailIds = [...new Set([...(conversation.emailIds || []), emailDoc._id])];
  conversation.latestEmailId = emailDoc._id;
  await conversation.save();

  emailDoc.conversationId = conversation._id;
  await emailDoc.save();

  return conversation;
}

export async function getPendingEmailForReply() {
  // Deprecated for WhatsApp commands — use resolveEmailFromThreadContext instead.
  const awaiting = await Email.findOne({ status: 'awaiting_approval' }).sort({ updatedAt: -1 });
  if (awaiting) return awaiting;
  return Email.findOne({ status: 'notified' }).sort({ date: -1 });
}

export async function getLatestPendingDraft() {
  return Draft.findOne({ status: { $in: ['generated', 'approved'] } }).sort({
    createdAt: -1,
  });
}

export async function setConversationState(conversationId, state) {
  if (!conversationId) return;
  await Conversation.updateOne({ _id: conversationId }, { $set: { state } });
}

export function buildReplyContext(emailDoc) {
  const from = emailDoc.from?.name
    ? `${emailDoc.from.name} <${emailDoc.from.address}>`
    : (emailDoc.from?.address || 'unknown');
  const to = (emailDoc.recipients || [])
    .filter((r) => r.type === 'to')
    .map((r) => r.address)
    .join(', ');
  return [
    `From: ${from}`,
    `To: ${to || 'unknown'}`,
    `Subject: ${emailDoc.subject || ''}`,
    `Date: ${emailDoc.date ? emailDoc.date.toISOString() : ''}`,
    '',
    emailDoc.bodyText || '',
  ].join('\n');
}

/** @deprecated Use buildReplyContext for WhatsApp replies — avoids blending separate messages. */
export async function buildThreadText(conversationId) {
  const emails = await Email.find({ conversationId }).sort({ date: 1 }).limit(10);

  return emails
    .map((e) => {
      const from = e.from?.name ? `${e.from.name} <${e.from.address}>` : (e.from?.address || 'unknown');
      const to = (e.recipients || [])
        .filter((r) => r.type === 'to')
        .map((r) => r.address)
        .join(', ');
      return [
        `From: ${from}`,
        `To: ${to || 'unknown'}`,
        `Subject: ${e.subject || ''}`,
        `Date: ${e.date ? e.date.toISOString() : ''}`,
        '',
        e.bodyText || '',
      ].join('\n');
    })
    .join('\n\n--------\n\n');
}
