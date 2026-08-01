import { Router } from 'express';
import mongoose from 'mongoose';
import { pingRedis } from '../database/redis.js';
import Email from '../models/Email.js';
import Conversation from '../models/Conversation.js';
import Draft from '../models/Draft.js';

const router = Router();

router.get('/', async (req, res) => {
  const redis = (await pingRedis()) ? 'up' : 'down';
  const mongo = mongoose.connection.readyState === 1 ? 'up' : 'down';

  let counts = {};
  if (mongo === 'up') {
    counts = {
      emails: await Email.countDocuments(),
      conversations: await Conversation.countDocuments(),
      drafts: await Draft.countDocuments(),
      notified: await Email.countDocuments({ status: 'notified' }),
      awaitingApproval: await Email.countDocuments({ status: 'awaiting_approval' }),
      sent: await Email.countDocuments({ status: 'sent' }),
      ignored: await Email.countDocuments({ status: 'ignored' }),
      archived: await Email.countDocuments({ status: 'archived' }),
    };
  }

  res.json({
    status: 'ok',
    service: 'falcon-ai',
    time: new Date().toISOString(),
    uptime: process.uptime(),
    mongo,
    redis,
    counts,
  });
});

export default router;
