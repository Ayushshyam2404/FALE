import env from '../../config/env.js';
import { logger } from '../logging.js';
import { enqueueWhatsAppMessage } from '../../queues/whatsappQueue.js';

let provider = null;

async function loadProviderModule(name) {
  return import(`./providers/${name}Provider.js`);
}

export async function initWhatsAppProvider() {
  if (provider) return provider;

  if (env.WHATSAPP.PROVIDER === 'baileys') {
    const baileysProvider = await loadProviderModule('baileys');
    provider = await baileysProvider.createProvider({
      onMessage: async (message) => {
        await enqueueWhatsAppMessage(message);
      },
    });
    logger.info('whatsapp.provider', 'Baileys WhatsApp provider initialized');
  } else {
    const cloudProvider = await loadProviderModule('cloud');
    provider = cloudProvider.default;
    logger.info('whatsapp.provider', 'Cloud API WhatsApp provider initialized');
  }

  return provider;
}

export async function sendWhatsAppText(to, text) {
  const active = await initWhatsAppProvider();
  return active.sendText(to, text);
}

export async function getWhatsAppQR() {
  if (env.WHATSAPP.PROVIDER !== 'baileys') return null;
  const baileysProvider = await loadProviderModule('baileys');
  return baileysProvider.getQR();
}
