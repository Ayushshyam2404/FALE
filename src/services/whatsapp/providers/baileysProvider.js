import fs from 'node:fs';
import path from 'node:path';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  jidNormalizedUser,
  Browsers,
} from '@whiskeysockets/baileys';
import env from '../../../config/env.js';
import { logger } from '../../logging.js';

const AUTH_DIR = path.join(env.UPLOAD_DIR, 'baileys-auth');
const SELF_JID_FILE = path.join(AUTH_DIR, 'self-chat-jid.json');

let sock = null;
let currentQR = null;
let onMessageHandler = null;
let selfChatJid = null;

// IDs of messages Falcon itself sent. Used to tell Falcon's own outgoing
// messages apart from the user's replies in a "Message Yourself" chat, where
// both sides arrive with fromMe = true.
const sentMessageIds = new Set();

// Cache for Baileys getMessage retries — missing this often causes
// "Waiting for this message" on the phone.
const messageStore = new Map();
const MAX_MESSAGE_STORE = 500;

function loadSelfChatJid() {
  try {
    if (!fs.existsSync(SELF_JID_FILE)) return null;
    const data = JSON.parse(fs.readFileSync(SELF_JID_FILE, 'utf8'));
    return data?.jid || null;
  } catch {
    return null;
  }
}

function saveSelfChatJid(jid) {
  if (!jid || jid === selfChatJid) return;
  selfChatJid = jid;
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.writeFileSync(SELF_JID_FILE, JSON.stringify({ jid, updatedAt: new Date().toISOString() }));
  logger.info('whatsapp.self_jid', `Self-chat JID set to ${jid}`);
}

function cacheMessage(msg) {
  const remoteJid = msg?.key?.remoteJid;
  const id = msg?.key?.id;
  if (!remoteJid || !id) return;
  const key = `${remoteJid}:${id}`;
  messageStore.set(key, msg);
  if (messageStore.size > MAX_MESSAGE_STORE) {
    const oldest = messageStore.keys().next().value;
    if (oldest) messageStore.delete(oldest);
  }
}

function toNumber(jid) {
  if (!jid) return null;
  const local = String(jid).split('@')[0].split(':')[0];
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

function extractTextFromQuoted(quoted) {
  if (!quoted) return '';
  const qm = quoted.message || quoted;
  if (typeof qm.conversation === 'string') return qm.conversation;
  if (qm.extendedTextMessage?.text) return qm.extendedTextMessage.text;
  return '';
}

function extractQuoteContext(msg) {
  const m = msg.message || {};
  const ctx =
    m.extendedTextMessage?.contextInfo ||
    m.imageMessage?.contextInfo ||
    m.videoMessage?.contextInfo ||
    m.documentMessage?.contextInfo;
  if (!ctx) return { quotedMessageId: null, quotedText: null };

  return {
    quotedMessageId: ctx.stanzaId || ctx.quotedMessage?.key?.id || null,
    quotedText: extractTextFromQuoted(ctx.quotedMessage),
  };
}

/**
 * Resolves the correct JID for outbound messages.
 * "Message yourself" chats use @lid JIDs; sending to @s.whatsapp.net breaks E2E
 * and shows "Waiting for this message" on the phone.
 */
function resolveRecipientJid(to) {
  const target = String(to).replace(/[^\d]/g, '');
  const ownNumber = sock?.user?.id ? toNumber(jidNormalizedUser(sock.user.id)) : null;
  const isSelfTarget = !target || ownNumber === target;

  if (isSelfTarget) {
    // "Message yourself" uses @lid; phone JID breaks E2E on linked devices.
    if (selfChatJid) return selfChatJid;
    if (sock?.user?.lid) return sock.user.lid;
    if (sock?.user?.id) return jidNormalizedUser(sock.user.id);
  }

  return `${target}@s.whatsapp.net`;
}

function rememberChatJid(msg) {
  const remoteJid = msg?.key?.remoteJid;
  if (!remoteJid || remoteJid.endsWith('@g.us')) return;

  const recipient = String(env.WHATSAPP.RECIPIENT).replace(/[^\d]/g, '');
  const chatNumber = toNumber(remoteJid);
  const isSelfChat =
    msg.key?.fromMe ||
    chatNumber === recipient ||
    (sock?.user?.id && chatNumber === toNumber(jidNormalizedUser(sock.user.id)));

  if (isSelfChat) {
    saveSelfChatJid(remoteJid);
  }
}

async function connect() {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  selfChatJid = loadSelfChatJid();

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
    browser: Browsers.macOS('Desktop'),
    markOnlineOnConnect: true,
    syncFullHistory: false,
    getMessage: async (key) => {
      if (!key?.remoteJid || !key?.id) return undefined;
      const stored = messageStore.get(`${key.remoteJid}:${key.id}`);
      return stored?.message;
    },
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
      const recipient = String(env.WHATSAPP.RECIPIENT).replace(/[^\d]/g, '');
      const ownNumber = sock?.user?.id ? toNumber(jidNormalizedUser(sock.user.id)) : null;

      if (ownNumber === recipient) {
        if (sock?.user?.lid) {
          saveSelfChatJid(sock.user.lid);
        } else if (sock?.user?.id) {
          saveSelfChatJid(jidNormalizedUser(sock.user.id));
        }
      }

      logger.info('whatsapp.connected', 'Baileys connected to WhatsApp', {
        selfChatJid,
      });
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
    for (const msg of messages || []) {
      cacheMessage(msg);
      rememberChatJid(msg);

      try {
        await processInboundMessage(msg, type);
      } catch (err) {
        logger.error('whatsapp.inbound_error', err.message, {
          type,
          remoteJid: msg.key?.remoteJid,
          fromMe: msg.key?.fromMe,
        });
      }
    }
  });
}

const processedInboundIds = new Set();

async function processInboundMessage(msg, type) {
  const msgId = msg.key?.id;
  if (msgId) {
    if (processedInboundIds.has(msgId)) return;
    processedInboundIds.add(msgId);
    if (processedInboundIds.size > 1000) {
      processedInboundIds.delete(processedInboundIds.values().next().value);
    }
  }

  const isOwnSend = msg.key?.fromMe && sentMessageIds.has(msg.key.id);
  const isUserSelfReply = msg.key?.fromMe && !isOwnSend;

  // User commands in self-chat can arrive as 'append' during sync — still process them.
  if (type !== 'notify' && !isUserSelfReply) return;

  if (isUserSelfReply) {
    // User replying in "Message Yourself" — falls through.
  } else if (msg.key?.fromMe) {
    return;
  } else {
    if (!msg.key?.remoteJid) return;
    if (msg.key.remoteJid.endsWith('@g.us')) return;
  }

  const text = extractText(msg);
  if (!text) {
    if (isUserSelfReply) {
      logger.warn('whatsapp.no_text', 'User self-chat message had no extractable text', {
        messageTypes: Object.keys(msg.message || {}),
      });
    }
    return;
  }

  const from =
    isUserSelfReply ? env.WHATSAPP.RECIPIENT : toNumber(msg.key.remoteJid);
  if (!from) return;

  if (from !== env.WHATSAPP.RECIPIENT) {
    logger.info('whatsapp.ignored', `Ignored message from ${from}`);
    return;
  }

  logger.info('whatsapp.received', `Received message from ${from}`, {
    text,
    ownSend: isOwnSend,
    upsertType: type,
    ...extractQuoteContext(msg),
  });

  if (onMessageHandler) {
    const { quotedMessageId, quotedText } = extractQuoteContext(msg);
    await onMessageHandler({ from, text, quotedMessageId, quotedText });
  }
}

export async function createProvider({ onMessage }) {
  onMessageHandler = onMessage;
  await connect();
  return {
    async sendText(to, text) {
      if (!sock) throw new Error('WhatsApp (Baileys) not connected yet');

      const jid = resolveRecipientJid(to);
      const sent = await sock.sendMessage(jid, { text });
      if (sent) cacheMessage(sent);

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
