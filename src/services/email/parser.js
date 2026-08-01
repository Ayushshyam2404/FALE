import fs from 'node:fs';
import path from 'node:path';
import { simpleParser } from 'mailparser';
import env from '../../config/env.js';

function normalizeAddressList(list) {
  // mailparser exposes to/cc/bcc/from/replyTo as AddressObject | AddressObject[] | false.
  // An AddressObject carries the real entries on its `.value` array.
  const arr = Array.isArray(list) ? list : list ? [list] : [];
  const items = [];
  for (const entry of arr) {
    if (entry && Array.isArray(entry.value)) items.push(...entry.value);
    else if (entry) items.push(entry);
  }
  return items.filter((item) => item && item.address);
}

function safeAddress(addr) {
  if (!addr) return { name: null, address: null };
  const first = normalizeAddressList(addr)[0] || {};
  return { name: first.name || null, address: first.address || null };
}

function collectAddresses(list, type) {
  return normalizeAddressList(list).map((item) => ({
    name: item.name || null,
    address: item.address,
    type,
  }));
}

function headerValue(parsed, name) {
  try {
    const value = parsed.headers?.get(name);
    if (Array.isArray(value)) return value.join(', ');
    return value || null;
  } catch {
    return null;
  }
}

function cleanId(id) {
  return (id || '').replace(/[<>]/g, '').trim();
}

function resolveThreadId(parsed) {
  const references = [].concat(parsed.references || []).filter(Boolean).map(cleanId);
  if (references.length > 0) return references[0];
  const inReplyTo = cleanId(parsed.inReplyTo);
  if (inReplyTo) return inReplyTo;
  return cleanId(parsed.messageId) || `generated-${Date.now()}`;
}

function sanitizeFilename(filename) {
  return String(filename).replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_{2,}/g, '_').slice(0, 150);
}

export function persistAttachments(messageId, attachments) {
  if (!attachments || attachments.length === 0) return [];
  const dir = path.join(env.UPLOAD_DIR, cleanId(messageId) || String(Date.now()));
  fs.mkdirSync(dir, { recursive: true });

  const saved = [];
  for (const att of attachments) {
    const disposition = (att.contentDisposition || '').toLowerCase();
    if (disposition === 'inline') continue;
    const filename = sanitizeFilename(att.filename || `attachment-${saved.length + 1}.bin`);
    const filePath = path.join(dir, filename);
    try {
      fs.writeFileSync(filePath, att.content);
    } catch (err) {
      continue;
    }
    saved.push({
      filename,
      contentType: att.contentType || 'application/octet-stream',
      size: att.content ? att.content.length : 0,
      path: filePath,
      contentId: att.cid || null,
    });
  }
  return saved;
}

export async function parseEmail(rawSource, { uid } = {}) {
  const parsed = await simpleParser(rawSource);

  const messageId = cleanId(parsed.messageId) || `imap-${uid || Date.now()}`;
  const threadId = resolveThreadId(parsed);

  return {
    imapUid: uid || null,
    messageId,
    threadId,
    from: safeAddress(parsed.from),
    recipients: [
      ...collectAddresses(parsed.to, 'to'),
      ...collectAddresses(parsed.cc, 'cc'),
      ...collectAddresses(parsed.bcc, 'bcc'),
    ],
    subject: parsed.subject || '(no subject)',
    bodyText: parsed.text || '',
    bodyHtml: parsed.html || '',
    date: parsed.date || new Date(),
    headers: {
      listId: headerValue(parsed, 'list-id'),
      autoSubmitted: headerValue(parsed, 'auto-submitted'),
      unsubscribe: headerValue(parsed, 'list-unsubscribe'),
      replyTo: parsed.replyTo ? safeAddress(parsed.replyTo) : null,
    },
    attachments: persistAttachments(messageId, parsed.attachments),
  };
}
