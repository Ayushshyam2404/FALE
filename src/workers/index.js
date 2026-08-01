import { Worker } from 'bullmq';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import mongoose from 'mongoose';
import { getRedis } from '../database/redis.js';
import { QUEUE_NAMES, JOB_NAMES } from '../config/constants.js';
import { connectDB } from '../database/connection.js';
import { ensurePollJob } from '../queues/emailQueue.js';
import { pollInbox } from './pollWorker.js';
import { processEmail } from './processWorker.js';
import { handleWhatsAppMessage } from './sendWorker.js';
import { initWhatsAppProvider } from '../services/whatsapp/provider.js';
import { logger } from '../services/logging.js';

const workers = [];

function attachErrorHandlers(workerName, worker) {
  worker.on('failed', (job, err) => {
    logger.error('worker.failed', `${workerName} job failed`, {
      jobId: job?.id,
      name: job?.name,
      error: err?.message,
    });
  });
  worker.on('error', (err) => {
    logger.error('worker.error', `${workerName} error: ${err.message}`);
  });
}

async function emailJobHandler(job) {
  switch (job.name) {
    case JOB_NAMES.POLL_INBOX:
      return pollInbox();
    case JOB_NAMES.PROCESS_EMAIL:
      return processEmail(job);
    default:
      logger.warn('worker.unknown_job', `Unknown email job: ${job.name}`);
      return { status: 'ignored' };
  }
}

export async function startWorkers() {
  if (mongoose.connection.readyState === 0) {
    await connectDB();
  }

  await ensurePollJob();

  await initWhatsAppProvider();

  const emailWorker = new Worker(QUEUE_NAMES.EMAIL, emailJobHandler, {
    connection: getRedis('worker'),
    concurrency: 3,
  });

  const sendWorker = new Worker(
    QUEUE_NAMES.WHATSAPP,
    async (job) => {
      if (job.name === JOB_NAMES.HANDLE_MESSAGE) {
        return handleWhatsAppMessage(job);
      }
      return { status: 'ignored' };
    },
    { connection: getRedis('worker'), concurrency: 1 },
  );

  workers.push(emailWorker, sendWorker);
  attachErrorHandlers('email', emailWorker);
  attachErrorHandlers('whatsapp', sendWorker);

  logger.info('worker.started', 'Falcon AI workers started');
  return workers;
}

export async function stopWorkers() {
  await Promise.all(workers.map((w) => w.close()));
  workers.length = 0;
}

const isDirectRun =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  startWorkers()
    .then(() => {
      logger.info('worker.ready', 'Dedicated worker process ready');
      const shutdown = () => {
        stopWorkers()
          .then(() => process.exit(0))
          .catch(() => process.exit(1));
      };
      process.on('SIGTERM', shutdown);
      process.on('SIGINT', shutdown);
    })
    .catch((err) => {
      logger.error('worker.fatal', err.message);
      process.exit(1);
    });
}
