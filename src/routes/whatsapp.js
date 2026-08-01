import { Router } from 'express';
import { verifyWebhook, handleInboundWebhook } from '../services/whatsapp/webhook.js';
import { getWhatsAppQR } from '../services/whatsapp/provider.js';
import { logger } from '../services/logging.js';

const router = Router();

router.get('/webhook', (req, res) => {
  const challenge = verifyWebhook(req.query);
  if (challenge !== null && challenge !== undefined) {
    logger.info('webhook.verified', 'WhatsApp webhook verified');
    return res.status(200).send(challenge);
  }
  logger.warn('webhook.verify_failed', 'WhatsApp webhook verification failed');
  return res.status(403).send('Verification failed');
});

router.post('/webhook', async (req, res) => {
  try {
    const handled = await handleInboundWebhook(req.body);
    logger.info('webhook.received', `Webhook payload handled`, { handled });
    res.sendStatus(200);
  } catch (err) {
    logger.error('webhook.error', err.message);
    res.sendStatus(200);
  }
});

router.get('/whatsapp/qr', async (req, res) => {
  const qr = await getWhatsAppQR();
  res.json({ provider: 'baileys', qr });
});

export default router;
