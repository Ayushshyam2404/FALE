import { Queue } from 'bullmq';
import { getRedis } from '../database/redis.js';
import { QUEUE_NAMES, JOB_NAMES } from '../config/constants.js';
import env from '../config/env.js';

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { age: 60 * 60 * 24, count: 1000 },
  removeOnFail: { age: 60 * 60 * 24 * 7 },
};

export const emailQueue = new Queue(QUEUE_NAMES.EMAIL, {
  connection: getRedis('queue'),
  defaultJobOptions,
});

export async function enqueueEmailProcessing({ uid, filePath }) {
  return emailQueue.add(JOB_NAMES.PROCESS_EMAIL, { uid, filePath }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  });
}

export async function ensurePollJob() {
  const repeatableJobs = await emailQueue.getRepeatableJobs();

  // Remove any existing poll jobs so a stale interval (e.g. a changed
  // POLL_INTERVAL_MS) can never stick around in Redis.
  const stale = repeatableJobs.filter((job) => job.name === JOB_NAMES.POLL_INBOX);
  for (const job of stale) {
    await emailQueue.removeRepeatableByKey(job.key);
  }

  await emailQueue.add(
    JOB_NAMES.POLL_INBOX,
    {},
    {
      repeat: { every: env.POLL_INTERVAL_MS },
      jobId: JOB_NAMES.POLL_INBOX,
      attempts: 2,
      removeOnComplete: true,
    },
  );
}

export async function closeEmailQueue() {
  await emailQueue.close();
}
