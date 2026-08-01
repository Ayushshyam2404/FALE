import fs from 'node:fs';
import path from 'node:path';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import env from '../../../config/env.js';
import { logger } from '../../logging.js';

const AUTH_DIR = path.join(env.UPLOAD_DIR, 'baileys-auth');

let sock = null;
let currentQR = null;
let onMessageHandler = null;

// IDs of messages Falcon itself sent. Used to tell Falcon's own outgoing
// messages apart from the user's replies in a "Message Yourself" chat, where
// both sides arrive with fromMe = true.
const sentMessageIds = new Set();

function toNumber(jid) {
  if (!jid) return null;
  const local = jid.split('@')[0];
  return local || null;
}

function extractText(msg) {
  const m = msg.message || {};
  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  if (m.imageMessage?.caption) return m.imageMessage.caption;
  if (m.videoMessage?.caption) return m.videoMessage.caption;
  if (m.documentMessage?.caption) return m.documentMessage.caption;
  return '';
}

async function connect() {
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  let version;
  try {
    version = (await fetchLatestBaileysVersion()).version;
  } catch {
    version = undefined;
  }

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      currentQR = qr;
      qrcode.generate(qr, { small: true }, (rendered) => {
        console.log('\n[Falcon AI] Scan this QR code with WhatsApp:\n');
        console.log(rendered);
        console.log('\n[Falcon AI] WhatsApp > Settings > Linked devices > Link a device\n');
      });
      logger.info('whatsapp.qr', 'New QR code generated - scan with WhatsApp');
    }

    if (connection === 'open') {
      currentQR = null;
      logger.info('whatsapp.connected', 'Baileys connected to WhatsApp');
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      logger.warn('whatsapp.closed', 'Baileys connection closed', {
        statusCode,
        shouldReconnect,
      });

      if (shouldReconnect) {
        setTimeout(connect, 3000);
      } else {
        currentQR = null;
        logger.error(
          'whatsapp.logged_out',
          'Logged out. Delete uploads/baileys-auth to re-pair.',
        );
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages || []) {
      const isOwnSend = msg.key?.fromMe && sentMessageIds.has(msg.key.id);

      if (msg.key?.fromMe && !isOwnSend) {
        // Falcon's session owns this number. Any fromMe message that Falcon did
        // not send itself is the user replying in the "Message Yourself" chat.
        // Falls through and is treated as a command.
      } else if (msg.key?.fromMe) {
        continue;
      } else {
        if (!msg.key?.remoteJid) continue;
        if (msg.key.remoteJid.endsWith('@g.us')) continue;
      }

      const text = extractText(msg);
      if (!text) continue;

      // A fromMe message that Falcon did not send is the user replying in the
      // "Message Yourself" chat. remoteJid may be a LID (Linked ID) rather than
      // the phone number, so trust the session owner instead of the jid.
      const from =
        msg.key?.fromMe && !isOwnSend
          ? env.WHATSAPP.RECIPIENT
          : toNumber(msg.key.remoteJid);
      if (!from) continue;

      if (from !== env.WHATSAPP.RECIPIENT) {
        logger.info('whatsapp.ignored', `Ignored message from ${from}`);
        continue;
      }

      logger.info('whatsapp.received', `Received message from ${from}`, { text, ownSend: isOwnSend });
      if (onMessageHandler) {
        await onMessageHandler({ from, text });
      }
    }
  });
}

export async function createProvider({ onMessage }) {
  onMessageHandler = onMessage;
  await connect();
  return {
    async sendText(to, text) {
      if (!sock) throw new Error('WhatsApp (Baileys) not connected yet');
      const clean = String(to).replace(/[^\d]/g, '');
      const jid = `${clean}@s.whatsapp.net`;
      const sent = await sock.sendMessage(jid, { text });
      const id = sent?.key?.id;
      if (id) {
        sentMessageIds.add(id);
        if (sentMessageIds.size > 500) {
          sentMessageIds.delete(sentMessageIds.values().next().value);
        }
      }
      logger.info('whatsapp.sent', `Baileys message sent to ${to}`, { jid });
      return sent;
    },
  };
}

export function getQR() {
  return currentQR;
}
