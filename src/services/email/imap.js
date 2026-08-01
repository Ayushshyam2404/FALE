import fs from 'node:fs';
import path from 'node:path';
import { ImapFlow } from 'imapflow';
import env from '../../config/env.js';
import { logger } from '../logging.js';

function rawPath(uid) {
  const dir = path.join(env.UPLOAD_DIR, 'raw');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${uid}.eml`);
}

/**
 * @param {{ sinceUid: number, storedUidValidity: number|undefined, max: number }} opts
 * @returns {Promise<{ messages: Array<{uid:number, filePath:string}>, highestUid:number, uidValidity:number }>}
 */
export async function fetchNewMessages({ sinceUid = 0, storedUidValidity, max = 100 }) {
  const client = new ImapFlow({
    host: env.IMAP.HOST,
    port: env.IMAP.PORT,
    secure: env.IMAP.SECURE,
    auth: { user: env.IMAP.USER, pass: env.IMAP.PASSWORD },
    logger: false,
  });

  const messages = [];

  try {
    await client.connect();
    await client.mailboxOpen(env.IMAP.MAILBOX);

    const { uidValidity, uidNext } = client.mailbox;
    const uidValidityStr = String(uidValidity);
    const highestUid = Number(uidNext) - 1;

    if (!highestUid || highestUid <= 0) {
      return { messages, highestUid: 0, uidValidity: uidValidityStr };
    }

    const mailboxReset =
      storedUidValidity !== undefined && String(storedUidValidity) !== uidValidityStr;

    // Fresh start (no baseline) or mailbox reset: begin at the most recent
    // messages instead of rescanning the entire backlog.
    const recentWindowStart = Math.max(highestUid - max + 1, 1);
    const start = mailboxReset
      ? recentWindowStart
      : sinceUid > 0
        ? sinceUid + 1
        : recentWindowStart;

    if (start > highestUid) {
      return { messages, highestUid, uidValidity: uidValidityStr };
    }

    let count = 0;
    for await (const msg of client.fetch(`${start}:*`, { uid: true, source: true }, { uid: true })) {
      if (!msg.source) continue;
      const filePath = rawPath(msg.uid);
      fs.writeFileSync(filePath, msg.source);
      messages.push({ uid: msg.uid, filePath });
      count += 1;
      if (count >= max) break;
    }

    return { messages, highestUid, uidValidity: uidValidityStr };
  } catch (err) {
    logger.error('imap.fetch_error', err.message, { sinceUid });
    throw err;
  } finally {
    await client.logout().catch(() => {});
  }
}
