import mongoose from 'mongoose';
import Log from '../models/Log.js';

function toJson(meta) {
  try {
    return meta === undefined || meta === null ? {} : JSON.parse(JSON.stringify(meta));
  } catch {
    return { _unserializable: true };
  }
}

export function log(level, event, message = '', meta = {}) {
  const entry = {
    level,
    event,
    message,
    meta: toJson(meta),
    timestamp: new Date().toISOString(),
  };

  const line = `[${entry.timestamp}] ${level.toUpperCase()} ${event} ${message}`;
  const metaStr = Object.keys(entry.meta).length ? ` ${JSON.stringify(entry.meta)}` : '';
  if (level === 'error') {
    console.error(line + metaStr);
  } else if (level === 'warn') {
    console.warn(line + metaStr);
  } else {
    console.log(line + metaStr);
  }

  if (mongoose.connection.readyState === 1) {
    Log.create(entry).catch(() => {});
  }

  return entry;
}

export const logger = {
  info: (event, message, meta) => log('info', event, message, meta),
  warn: (event, message, meta) => log('warn', event, message, meta),
  error: (event, message, meta) => log('error', event, message, meta),
  debug: (event, message, meta) => log('debug', event, message, meta),
};

export default logger;
