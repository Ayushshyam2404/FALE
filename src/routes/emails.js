import { Router } from 'express';
import Email from '../models/Email.js';
import { sendWhatsAppForEmail, formatEmailNotification } from '../services/whatsapp/notify.js';
import { logger } from '../services/logging.js';
import env from '../config/env.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const { status, category, limit = 50, page = 1 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (category) filter.category = category;

    const docs = await Email.find(filter)
      .sort({ date: -1 })
      .limit(Math.min(Number(limit) || 50, 200))
      .skip((Number(page) - 1) * (Number(limit) || 50));

    const total = await Email.countDocuments(filter);
    res.json({ page: Number(page), limit: Number(limit), total, items: docs });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const doc = await Email.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Email not found' });
    res.json(doc);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/notify', async (req, res, next) => {
  try {
    const doc = await Email.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Email not found' });
    await sendWhatsAppForEmail(
      env.WHATSAPP.RECIPIENT,
      formatEmailNotification(doc),
      { emailId: doc._id, type: 'notification' },
    );
    logger.info('api.email_notified', `Re-notified email ${doc._id}`);
    res.json({ ok: true, notified: doc._id });
  } catch (err) {
    next(err);
  }
});

export default router;
