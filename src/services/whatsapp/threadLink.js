import Email from '../../models/Email.js';
import Draft from '../../models/Draft.js';
import WhatsAppLink from '../../models/WhatsAppLink.js';

const THREAD_REF_RE = /\[Thread ([A-F0-9]{6})\]/i;
const NOTIFICATION_SUBJECT_RE = /New Email:\s*(.+?)(?:\n|$)/i;
const NOTIFICATION_FROM_RE = /From:\s*(.+?)(?:\n|$)/i;

export function emailThreadRef(email) {
  return String(email._id).slice(-6).toUpperCase();
}

/** Infer message type from quoted Falcon message body when DB link is missing. */
export function inferQuotedType(quotedText) {
  const text = String(quotedText || '');
  if (/\[Thread [A-F0-9]{6}\] New Email:/i.test(text) || /^New Email:/im.test(text)) {
    return 'notification';
  }
  if (/Draft ready for your review/i.test(text)) return 'draft';
  if (/\[Thread [A-F0-9]{6}\] Email sent/i.test(text) || /^Email sent/im.test(text)) {
    return 'sent_confirmation';
  }
  if (/Open threads \(/i.test(text)) return 'status';
  if (/Drafting and sending your reply/i.test(text)) return 'status';
  return null;
}

function parseFromLine(fromLine) {
  const angle = fromLine.match(/<([^>]+)>/);
  if (angle) return angle[1].trim().toLowerCase();
  const bare = fromLine.match(/([\w.+-]+@[\w.-]+\.\w+)/);
  return bare ? bare[1].toLowerCase() : null;
}

function normalizeSubject(subject) {
  return String(subject || '')
    .replace(/^(\s*Re:\s*)+/gi, '')
    .trim()
    .toLowerCase();
}

async function resolveEmailFromQuotedNotification(quotedText) {
  const text = String(quotedText || '');
  const subjectMatch = text.match(NOTIFICATION_SUBJECT_RE);
  if (!subjectMatch) return null;

  const quotedSubject = subjectMatch[1].trim();
  const normalizedQuoted = normalizeSubject(quotedSubject);

  const fromMatch = text.match(NOTIFICATION_FROM_RE);
  const fromAddress = fromMatch ? parseFromLine(fromMatch[1]) : null;

  const candidates = await Email.find({
    status: { $in: ['notified', 'awaiting_approval'] },
  })
    .sort({ updatedAt: -1 })
    .limit(50);

  return (
    candidates.find((e) => {
      const subjMatch =
        e.subject === quotedSubject ||
        normalizeSubject(e.subject) === normalizedQuoted ||
        quotedSubject.includes(e.subject) ||
        e.subject.includes(quotedSubject.replace(/^Re:\s*/i, ''));
      if (!subjMatch) return false;
      if (fromAddress && e.from?.address) {
        return e.from.address.toLowerCase() === fromAddress;
      }
      return true;
    }) || null
  );
}

export async function linkWhatsAppMessage(waMessageId, { emailId, draftId, type = 'notification' }) {
  if (!waMessageId || (!emailId && !draftId)) return;
  await WhatsAppLink.findOneAndUpdate(
    { waMessageId },
    { waMessageId, emailId, draftId, type },
    { upsert: true },
  );
  if (emailId && type === 'notification') {
    await Email.updateOne({ _id: emailId }, { $set: { whatsappNotificationId: waMessageId } });
  }
}

export async function resolveEmailFromThreadContext({ quotedMessageId, quotedText }) {
  if (quotedMessageId) {
    const byNotificationId = await Email.findOne({
      whatsappNotificationId: quotedMessageId,
      status: { $in: ['notified', 'awaiting_approval'] },
    });
    if (byNotificationId) return byNotificationId;

    const link = await WhatsAppLink.findOne({ waMessageId: quotedMessageId }).lean();
    if (link?.emailId) {
      return Email.findById(link.emailId);
    }
    if (link?.draftId) {
      const draft = await Draft.findById(link.draftId);
      if (draft?.emailId) return Email.findById(draft.emailId);
    }
  }

  const refMatch = String(quotedText || '').match(THREAD_REF_RE);
  if (refMatch) {
    const suffix = refMatch[1].toUpperCase();
    const candidates = await Email.find({
      status: { $in: ['notified', 'awaiting_approval'] },
    })
      .sort({ updatedAt: -1 })
      .limit(50);
    const match = candidates.find((e) => emailThreadRef(e) === suffix);
    if (match) return match;
  }

  return resolveEmailFromQuotedNotification(quotedText);
}

export async function getDraftForEmail(emailDoc) {
  return Draft.findOne({
    emailId: emailDoc._id,
    status: { $in: ['generated', 'approved'] },
  }).sort({ createdAt: -1 });
}

export async function getQuotedLinkType(quotedMessageId, quotedText) {
  if (quotedMessageId) {
    const link = await WhatsAppLink.findOne({ waMessageId: quotedMessageId }).lean();
    if (link?.type) return link.type;

    const email = await Email.findOne({ whatsappNotificationId: quotedMessageId }).lean();
    if (email) return 'notification';
  }
  return inferQuotedType(quotedText);
}
