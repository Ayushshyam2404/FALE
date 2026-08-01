import State from '../models/State.js';
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

export async function pollInbox() {
  const state = await getImapState();
  const firstRun = !(state.uid > 0);
  const { messages, highestUid, uidValidity } = await fetchNewMessages({
    sinceUid: state.uid,
    storedUidValidity: state.uidValidity,
    max: firstRun ? env.FIRST_RUN_MAX_FETCH : env.POLL_MAX_FETCH,
  });

  // Process newest messages first so freshly received emails are handled promptly.
  messages.reverse();

  for (const message of messages) {
    await enqueueEmailProcessing({ uid: message.uid, filePath: message.filePath });
  }

  await saveImapState({ uid: highestUid, uidValidity });

  logger.info('imap.polled', `Fetched ${messages.length} new message(s), highest UID ${highestUid}`, {
    count: messages.length,
    highestUid,
  });

  return { count: messages.length, highestUid };
}
