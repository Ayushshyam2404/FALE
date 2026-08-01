import mongoose from 'mongoose';
import env from '../config/env.js';
import { logger } from '../services/logging.js';

export async function connectDB() {
  if (mongoose.connection.readyState === 1 || mongoose.connection.readyState === 2) {
    return mongoose.connection;
  }
  mongoose.set('strictQuery', true);
  mongoose.connection.on('error', (err) => {
    logger.error('db.error', err.message);
  });
  mongoose.connection.on('disconnected', () => {
    logger.warn('db.disconnected', 'MongoDB disconnected');
  });
  await mongoose.connect(env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  logger.info('db.connected', 'MongoDB connected');
  return mongoose.connection;
}

export async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
}
