import { Queue } from 'bullmq';
import { getRedis } from '../database/redis.js';
import { QUEUE_NAMES, JOB_NAMES } from '../config/constants.js';

export const whatsappQueue = new Queue(QUEUE_NAMES.WHATSAPP, {
  connection: getRedis('queue'),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: { age: 60 * 60 * 24, count: 1000 },
    removeOnFail: { age: 60 * 60 * 24 * 7 },
  },
});

export async function enqueueWhatsAppMessage({ from, text }) {
  return whatsappQueue.add(JOB_NAMES.HANDLE_MESSAGE, { from, text });
}

export async function closeWhatsAppQueue() {
  await whatsappQueue.close();
}
