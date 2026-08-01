import mongoose from 'mongoose';

const { Schema } = mongoose;

const logSchema = new Schema(
  {
    level: {
      type: String,
      enum: ['info', 'warn', 'error', 'debug'],
      default: 'info',
      index: true,
    },
    event: { type: String, index: true },
    message: { type: String, default: '' },
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

logSchema.index({ createdAt: -1 });

export default mongoose.model('Log', logSchema);
