import env from '../../config/env.js';
import { logger } from '../logging.js';
import { enqueueWhatsAppMessage } from '../../queues/whatsappQueue.js';

/**
 * Verifies the WhatsApp Cloud API webhook challenge.
 * Returns the challenge string if verification succeeds, otherwise null.
 */
export function verifyWebhook(query = {}) {
  const mode = query['hub.mode'];
  const token = query['hub.verify_token'];
  const challenge = query['hub.challenge'];

  if (mode === 'subscribe' && token === env.WHATSAPP.VERIFY_TOKEN) {
    return challenge;
  }
  return null;
}

/**
 * Processes an inbound WhatsApp webhook payload.
 * Only text messages from the configured admin recipient are accepted.
 * Returns the number of messages enqueued.
 */
export async function handleInboundWebhook(body = {}) {
  let handled = 0;

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};

      for (const message of value.messages || []) {
        if (message.from !== env.WHATSAPP.RECIPIENT) {
          logger.info('whatsapp.ignored', `Ignored message from ${message.from}`);
          continue;
        }
        if (message.type !== 'text') {
          logger.info('whatsapp.ignored', `Ignored non-text message type: ${message.type}`);
          continue;
        }

        const text = (message.text?.body || '').trim();
        if (!text) continue;

        await enqueueWhatsAppMessage({ from: message.from, text });
        handled += 1;
      }
    }
  }

  return handled;
}
