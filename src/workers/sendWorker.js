import Draft from '../models/Draft.js';
import Email from '../models/Email.js';
import Conversation from '../models/Conversation.js';
import { parseWhatsAppCommand } from '../services/whatsapp/commands.js';
import { generateDraft } from '../services/ai/draft.js';
import { sendEmail } from '../services/email/smtp.js';
import {
  sendWhatsAppText,
  formatDraft,
} from '../services/whatsapp/notify.js';
import {
  getPendingEmailForReply,
  getLatestPendingDraft,
  buildThreadText,
  setConversationState,
} from '../services/conversation.js';
import { logger } from '../services/logging.js';
import env from '../config/env.js';
import { WHATSAPP_COMMANDS } from '../config/constants.js';

async function createDraftForEmail(emailDoc, instruction) {
  const thread = await buildThreadText(emailDoc.conversationId);
  const generated = await generateDraft({
    instruction,
    thread,
    senderName: env.SENDER_NAME,
  });

  let draft = await Draft.findOne({
    emailId: emailDoc._id,
    status: { $in: ['generated', 'approved'] },
  });

  if (draft) {
    draft.subject = generated.subject;
    draft.body = generated.body;
    draft.signature = env.SIGNATURE;
    draft.instructions = instruction;
    draft.status = 'generated';
    await draft.save();
  } else {
    draft = await Draft.create({
      conversationId: emailDoc.conversationId,
      emailId: emailDoc._id,
      subject: generated.subject,
      body: generated.body,
      signature: env.SIGNATURE,
      instructions: instruction,
      status: 'generated',
      attachments: emailDoc.attachments || [],
    });
    await Conversation.updateOne(
      { _id: draft.conversationId },
      { $addToSet: { draftIds: draft._id } },
    );
  }

  emailDoc.status = 'awaiting_approval';
  emailDoc.replyDraftId = draft._id;
  await emailDoc.save();
  await setConversationState(emailDoc.conversationId, 'awaiting_approval');

  return draft;
}

async function handleDraft(instruction) {
  const emailDoc = await getPendingEmailForReply();
  if (!emailDoc) {
    await sendWhatsAppText(
      env.WHATSAPP.RECIPIENT,
      'No pending email to reply to. Falcon is idle.',
    );
    return { status: 'no_pending_email' };
  }

  const draft = await createDraftForEmail(emailDoc, instruction);

  await sendWhatsAppText(env.WHATSAPP.RECIPIENT, formatDraft(draft));
  logger.info('draft.generated', 'Draft sent to WhatsApp for approval', {
    draftId: draft._id,
    emailId: emailDoc._id,
  });
  return { status: 'draft_generated', draftId: draft._id };
}

async function sendDraftToEmail(draft) {
  const emailDoc = await Email.findById(draft.emailId);
  if (!emailDoc || !emailDoc.from?.address) {
    await sendWhatsAppText(
      env.WHATSAPP.RECIPIENT,
      'Cannot send: the original sender address is missing.',
    );
    return { status: 'missing_sender', emailDoc: null };
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

  await sendWhatsAppText(
    env.WHATSAPP.RECIPIENT,
    `Email sent to ${emailDoc.from.address}\nSubject: ${draft.subject}`,
  );

  logger.info('email.sent', `Reply sent to ${emailDoc.from.address}`, {
    draftId: draft._id,
    smtpMessageId: info.messageId,
  });
  return { status: 'sent', draftId: draft._id, emailDoc };
}

async function handleSend(instruction) {
  if (instruction) {
    const emailDoc = await getPendingEmailForReply();
    if (!emailDoc) {
      await sendWhatsAppText(
        env.WHATSAPP.RECIPIENT,
        'No pending email to reply to. Falcon is idle.',
      );
      return { status: 'no_pending_email' };
    }

    const draft = await createDraftForEmail(emailDoc, instruction);
    await sendWhatsAppText(env.WHATSAPP.RECIPIENT, formatDraft(draft));
    logger.info('draft.generated', 'Draft generated from /send for approval', {
      draftId: draft._id,
      emailId: emailDoc._id,
    });
    return { status: 'draft_generated', draftId: draft._id };
  }

  const draft = await getLatestPendingDraft();
  if (!draft) {
    await sendWhatsAppText(
      env.WHATSAPP.RECIPIENT,
      'No draft awaiting approval to send.',
    );
    return { status: 'no_pending_draft' };
  }

  return sendDraftToEmail(draft);
}

async function handleCancel() {
  const draft = await getLatestPendingDraft();
  if (!draft) {
    await sendWhatsAppText(
      env.WHATSAPP.RECIPIENT,
      'No draft awaiting approval to cancel.',
    );
    return { status: 'no_pending_draft' };
  }

  draft.status = 'cancelled';
  await draft.save();

  const emailDoc = await Email.findById(draft.emailId);
  if (emailDoc && emailDoc.status === 'awaiting_approval') {
    emailDoc.status = 'notified';
    await emailDoc.save();
  }
  await setConversationState(draft.conversationId, 'cancelled');

  await sendWhatsAppText(
    env.WHATSAPP.RECIPIENT,
    'Draft discarded. No email was sent.',
  );

  logger.info('draft.cancelled', 'Draft cancelled', { draftId: draft._id });
  return { status: 'cancelled', draftId: draft._id };
}

export async function handleWhatsAppMessage(job) {
  const { from, text } = job.data;
  const command = parseWhatsAppCommand(text);

  logger.info('whatsapp.received', `Command ${command.type} from ${from}`, { text });

  switch (command.type) {
    case WHATSAPP_COMMANDS.SEND:
      return handleSend(command.instruction);
    case WHATSAPP_COMMANDS.CANCEL:
      return handleCancel();
    case WHATSAPP_COMMANDS.EDIT:
      return handleDraft(command.instruction || 'Compose a professional reply.');
    default:
      return handleDraft(command.instruction);
  }
}
