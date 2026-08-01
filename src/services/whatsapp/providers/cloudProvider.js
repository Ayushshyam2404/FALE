import env from '../../../config/env.js';
import { logger } from '../../logging.js';

async function graphRequest(endpoint, body) {
  const url = `https://graph.facebook.com/${env.WHATSAPP.API_VERSION}/${env.WHATSAPP.PHONE_NUMBER_ID}/${endpoint}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.WHATSAPP.ACCESS_TOKEN}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WhatsApp API error (${res.status}): ${text.slice(0, 500)}`);
  }
  return res.json();
}

async function sendText(to, text) {
  if (!to || !text) {
    throw new Error('sendText requires recipient and text');
  }
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body: text },
  };
  const data = await graphRequest('messages', payload);
  logger.info('whatsapp.sent', `WhatsApp message sent to ${to}`, {
    waMessageId: data?.messages?.[0]?.id,
  });
  return data;
}

export default { sendText };
