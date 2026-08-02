import fs from 'node:fs';
import path from 'node:path';
import State from '../models/State.js';
import Email from '../models/Email.js';
import env from '../config/env.js';
import { fetchNewMessages } from '../services/email/imap.js';
import { enqueueEmailProcessing } from '../queues/emailQueue.js';
import { logger } from '../services/logging.js';

const IMAP_STATE_KEY = 'imap';

async function getImapState() {
  const doc = await State.findOne({ key: IMAP_STATE_KEY }).lean();
  return {
    uid: Number(doc?.value?.uid) || 0,
    uidValidity: doc?.value?.uidValidity || undefined,
  };
}

async function saveImapState({ uid, uidValidity }) {
  await State.updateOne(
    { key: IMAP_STATE_KEY },
    { $set: { value: { uid, uidValidity } } },
    { upsert: true },
  );
}

/**
 * Re-enqueue raw .eml files that were fetched but never made it into MongoDB
 * (e.g. after a worker crash or exhausted retries).
 */
async function recoverOrphanedRawFiles() {
  const dir = path.join(env.UPLOAD_DIR, 'raw');
  if (!fs.existsSync(dir)) return 0;

  let recovered = 0;
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.eml')) continue;
    const uid = Number(file.replace('.eml', ''));
    if (!Number.isFinite(uid) || uid <= 0) continue;

    const exists = await Email.exists({ imapUid: uid });
    if (exists) continue;

    const filePath = path.join(dir, file);
    await enqueueEmailProcessing({ uid, filePath });
    recovered += 1;
  }

  if (recovered > 0) {
    logger.info('imap.recovered', `Re-queued ${recovered} orphaned raw email(s)`);
  }
  return recovered;
}

export async function pollInbox() {
  await recoverOrphanedRawFiles();

  const state = await getImapState();
  const firstRun = !(state.uid > 0);
  const { messages, highestUid, uidValidity } = await fetchNewMessages({
    sinceUid: state.uid,
    storedUidValidity: state.uidValidity,
    max: firstRun ? env.FIRST_RUN_MAX_FETCH : env.POLL_MAX_FETCH,
  });

  // Process newest messages first so freshly received emails are handled promptly.
  messages.reverse();

  let lastEnqueuedUid = state.uid;
  for (const message of messages) {
    await enqueueEmailProcessing({ uid: message.uid, filePath: message.filePath });
    lastEnqueuedUid = Math.max(lastEnqueuedUid, message.uid);
  }

  const nextUid = messages.length > 0 ? Math.max(highestUid, lastEnqueuedUid) : state.uid;
  await saveImapState({ uid: nextUid, uidValidity });

  logger.info('imap.polled', `Fetched ${messages.length} new message(s), highest UID ${nextUid}`, {
    count: messages.length,
    highestUid: nextUid,
  });

  return { count: messages.length, highestUid: nextUid };
}
