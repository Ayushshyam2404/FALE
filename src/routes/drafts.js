import { Router } from 'express';
import Draft from '../models/Draft.js';
import Email from '../models/Email.js';
import { sendEmail } from '../services/email/smtp.js';
import { setConversationState } from '../services/conversation.js';
import { sendWhatsAppText } from '../services/whatsapp/notify.js';
import { logger } from '../services/logging.js';
import env from '../config/env.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const { status, limit = 50 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    const docs = await Draft.find(filter).sort({ createdAt: -1 }).limit(Math.min(Number(limit) || 50, 200));
    res.json({ items: docs });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const doc = await Draft.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Draft not found' });
    res.json(doc);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/send', async (req, res, next) => {
  try {
    const draft = await Draft.findById(req.params.id);
    if (!draft) return res.status(404).json({ error: 'Draft not found' });
    if (!['generated', 'approved'].includes(draft.status)) {
      return res.status(400).json({ error: `Draft cannot be sent from status ${draft.status}` });
    }

    const emailDoc = await Email.findById(draft.emailId);
    if (!emailDoc || !emailDoc.from?.address) {
      return res.status(400).json({ error: 'Original sender address is missing' });
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
    ).catch(() => {});

    logger.info('api.draft_sent', `Draft ${draft._id} sent via API`, { smtpMessageId: info.messageId });
    res.json({ ok: true, draftId: draft._id, smtpMessageId: info.messageId });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/cancel', async (req, res, next) => {
  try {
    const draft = await Draft.findById(req.params.id);
    if (!draft) return res.status(404).json({ error: 'Draft not found' });

    draft.status = 'cancelled';
    await draft.save();

    const emailDoc = await Email.findById(draft.emailId);
    if (emailDoc && emailDoc.status === 'awaiting_approval') {
      emailDoc.status = 'notified';
      await emailDoc.save();
    }
    await setConversationState(draft.conversationId, 'cancelled');

    res.json({ ok: true, draftId: draft._id });
  } catch (err) {
    next(err);
  }
});

export default router;
