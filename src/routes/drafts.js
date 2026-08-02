import { Router } from 'express';
import Draft from '../models/Draft.js';
import { sendApprovedDraft, cancelPendingDraft } from '../services/draftActions.js';
import { logger } from '../services/logging.js';

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

    const result = await sendApprovedDraft(draft);
    logger.info('api.draft_sent', `Draft ${draft._id} sent via API`, {
      smtpMessageId: result.smtpMessageId,
    });
    res.json({ ok: true, draftId: result.draftId, smtpMessageId: result.smtpMessageId });
  } catch (err) {
    if (err.message.includes('cannot be sent') || err.message.includes('missing')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/:id/cancel', async (req, res, next) => {
  try {
    const draft = await Draft.findById(req.params.id);
    if (!draft) return res.status(404).json({ error: 'Draft not found' });

    const result = await cancelPendingDraft(draft, { notifyWhatsApp: false });
    res.json({ ok: true, draftId: result.draftId });
  } catch (err) {
    next(err);
  }
});

export default router;
