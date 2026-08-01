import IORedis from 'ioredis';
import env from '../config/env.js';
import { logger } from '../services/logging.js';

const instances = new Map();
const lastLoggedErrorAt = new Map();

function throttledRedisError(label, err) {
  const now = Date.now();
  const last = lastLoggedErrorAt.get(label) || 0;
  if (now - last > 15000) {
    lastLoggedErrorAt.set(label, now);
    logger.error('redis.error', `Redis (${label}) error: ${err.message}`);
  }
}

export function getRedis(label = 'default') {
  if (!instances.has(label)) {
    const client = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: (times) => Math.min(times * 200, 5000),
    });
    client.on('error', (err) => throttledRedisError(label, err));
    instances.set(label, client);
  }
  return instances.get(label);
}

export async function pingRedis(label = 'default') {
  const client = getRedis(label);
  if (client.status !== 'ready') return false;
  try {
    const reply = await client.ping();
    return reply === 'PONG';
  } catch {
    return false;
  }
}

export async function closeRedis(label = 'default') {
  const client = instances.get(label);
  if (client) {
    instances.delete(label);
    await client.quit().catch(() => {});
  }
}

export async function closeAllRedis() {
  await Promise.all([...instances.keys()].map((label) => closeRedis(label)));
}
