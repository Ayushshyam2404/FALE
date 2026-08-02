import Draft from '../models/Draft.js';
import Email from '../models/Email.js';
import Conversation from '../models/Conversation.js';
import { parseWhatsAppCommand, buildDraftInstruction } from '../services/whatsapp/commands.js';
import { generateDraft } from '../services/ai/draft.js';
import {
  sendWhatsAppText,
  sendWhatsAppForEmail,
  formatDraft,
  formatSentConfirmation,
  formatPendingList,
} from '../services/whatsapp/notify.js';
import {
  resolveEmailFromThreadContext,
  getDraftForEmail,
  getQuotedLinkType,
} from '../services/whatsapp/threadLink.js';
import {
  buildReplyContext,
  setConversationState,
} from '../services/conversation.js';
import { sendApprovedDraft, cancelPendingDraft } from '../services/draftActions.js';
import { logger } from '../services/logging.js';
import env from '../config/env.js';
import { WHATSAPP_COMMANDS } from '../config/constants.js';

const NO_THREAD_MSG =
  'Reply directly to the Falcon email notification for that thread (swipe-to-reply on that message). Type STATUS to see open threads.';

async function requireThreadEmail(quotedMessageId, quotedText) {
  const emailDoc = await resolveEmailFromThreadContext({ quotedMessageId, quotedText });
  if (!emailDoc) {
    await sendWhatsAppText(env.WHATSAPP.RECIPIENT, NO_THREAD_MSG);
    return null;
  }
  if (!['notified', 'awaiting_approval'].includes(emailDoc.status)) {
    await sendWhatsAppText(
      env.WHATSAPP.RECIPIENT,
      `That email thread is already marked "${emailDoc.status}". No action taken.`,
    );
    return null;
  }
  logger.info('thread.resolved', `Reply scoped to email ${emailDoc._id}`, {
    subject: emailDoc.subject,
    quotedMessageId,
  });
  return emailDoc;
}

async function createDraftForEmail(emailDoc, instruction) {
  const draftInstruction = buildDraftInstruction(emailDoc, instruction);
  const thread = buildReplyContext(emailDoc);
  const generated = await generateDraft({
    instruction: draftInstruction,
    thread,
    senderName: env.SENDER_NAME,
    originalSubject: emailDoc.subject,
    replyQuestion: emailDoc.replyQuestion,
  });

  let draft = await Draft.findOne({
    emailId: emailDoc._id,
    status: { $in: ['generated', 'approved'] },
  });

  if (draft) {
    draft.subject = generated.subject;
    draft.body = generated.body;
    draft.signature = env.SIGNATURE;
    draft.instructions = draftInstruction;
    draft.status = 'generated';
    await draft.save();
  } else {
    draft = await Draft.create({
      conversationId: emailDoc.conversationId,
      emailId: emailDoc._id,
      subject: generated.subject,
      body: generated.body,
      signature: env.SIGNATURE,
      instructions: draftInstruction,
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

async function handleDraft(instruction, threadContext) {
  const emailDoc = await requireThreadEmail(
    threadContext.quotedMessageId,
    threadContext.quotedText,
  );
  if (!emailDoc) return { status: 'no_thread' };

  const draft = await createDraftForEmail(emailDoc, instruction);

  await sendWhatsAppForEmail(
    env.WHATSAPP.RECIPIENT,
    formatDraft(draft, emailDoc),
    { emailId: emailDoc._id, draftId: draft._id, type: 'draft' },
  );
  logger.info('draft.generated', 'Draft sent to WhatsApp for approval', {
    draftId: draft._id,
    emailId: emailDoc._id,
  });
  return { status: 'draft_generated', draftId: draft._id, emailId: emailDoc._id };
}

async function handleSend(instruction, threadContext) {
  const emailDoc = await requireThreadEmail(
    threadContext.quotedMessageId,
    threadContext.quotedText,
  );
  if (!emailDoc) return { status: 'no_thread' };

  // Bare SEND → approve and send the existing draft for this thread.
  if (instruction === undefined) {
    const draft = await getDraftForEmail(emailDoc);
    if (!draft) {
      await sendWhatsAppText(
        env.WHATSAPP.RECIPIENT,
        'No draft for this thread. Swipe-reply with your answer or use /send <message>.',
      );
      return { status: 'no_pending_draft' };
    }

    try {
      const result = await sendApprovedDraft(draft, { notifyWhatsApp: false });
      await sendWhatsAppForEmail(
        env.WHATSAPP.RECIPIENT,
        formatSentConfirmation({ draft, emailDoc: result.emailDoc }),
        { emailId: emailDoc._id, type: 'sent_confirmation' },
      );
      return result;
    } catch (err) {
      await sendWhatsAppText(env.WHATSAPP.RECIPIENT, `Cannot send: ${err.message}`);
      return { status: 'send_failed', error: err.message };
    }
  }

  const resolvedInstruction = buildDraftInstruction(emailDoc, instruction);

  await sendWhatsAppForEmail(
      env.WHATSAPP.RECIPIENT,
      'Drafting and sending your reply...',
      { emailId: emailDoc._id, type: 'status' },
    );

    const draft = await createDraftForEmail(emailDoc, resolvedInstruction);

    try {
      const result = await sendApprovedDraft(draft, { notifyWhatsApp: false });
      await sendWhatsAppForEmail(
        env.WHATSAPP.RECIPIENT,
        formatSentConfirmation({ draft, emailDoc: result.emailDoc }),
        { emailId: emailDoc._id, type: 'sent_confirmation' },
      );
      logger.info('draft.sent_via_slash', 'Draft generated and sent', {
        draftId: draft._id,
        emailId: emailDoc._id,
      });
      return { status: 'sent', draftId: draft._id, smtpMessageId: result.smtpMessageId };
    } catch (err) {
      await sendWhatsAppForEmail(
        env.WHATSAPP.RECIPIENT,
        formatDraft(draft, emailDoc),
        { emailId: emailDoc._id, draftId: draft._id, type: 'draft' },
      );
      await sendWhatsAppText(
        env.WHATSAPP.RECIPIENT,
        `Send failed: ${err.message}. Swipe-reply SEND on the draft to retry.`,
      );
      logger.error('draft.send_failed', err.message, { draftId: draft._id });
      return { status: 'send_failed', error: err.message, draftId: draft._id };
    }
}

async function handleCancel(threadContext) {
  const emailDoc = await requireThreadEmail(
    threadContext.quotedMessageId,
    threadContext.quotedText,
  );
  if (!emailDoc) return { status: 'no_thread' };

  const draft = await getDraftForEmail(emailDoc);
  if (!draft) {
    await sendWhatsAppText(
      env.WHATSAPP.RECIPIENT,
      'No draft awaiting approval for this thread.',
    );
    return { status: 'no_pending_draft' };
  }

  return cancelPendingDraft(draft);
}

async function handleStatus() {
  const pending = await Email.find({
    status: { $in: ['notified', 'awaiting_approval'] },
  })
    .sort({ date: -1 })
    .limit(10)
    .lean();

  await sendWhatsAppText(env.WHATSAPP.RECIPIENT, formatPendingList(pending));
  return { status: 'status_sent', count: pending.length };
}

export async function handleWhatsAppMessage(job) {
  const { from, text, quotedMessageId, quotedText } = job.data;
  const quotedType = await getQuotedLinkType(quotedMessageId, quotedText);
  const command = parseWhatsAppCommand(text, { quotedType, quotedText });
  const threadContext = { quotedMessageId, quotedText };

  logger.info('whatsapp.received', `Command ${command.type} from ${from}`, {
    text,
    quotedMessageId,
    quotedType,
  });

  try {
    switch (command.type) {
      case WHATSAPP_COMMANDS.STATUS:
        return handleStatus();
      case WHATSAPP_COMMANDS.SEND:
        return handleSend(command.instruction, threadContext);
      case WHATSAPP_COMMANDS.CANCEL:
        return handleCancel(threadContext);
      case WHATSAPP_COMMANDS.EDIT:
        return handleDraft(
          command.instruction || 'Compose a professional reply.',
          threadContext,
        );
      default:
        return handleDraft(command.instruction, threadContext);
    }
  } catch (err) {
    logger.error('whatsapp.handler_failed', err.message, { from, command: command.type });
    await sendWhatsAppText(
      env.WHATSAPP.RECIPIENT,
      `Something went wrong: ${err.message}. Please try again.`,
    ).catch(() => {});
    throw err;
  }
}
