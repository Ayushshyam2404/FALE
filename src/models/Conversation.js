import mongoose from 'mongoose';

const { Schema } = mongoose;

const conversationSchema = new Schema(
  {
    threadId: { type: String, unique: true, index: true },
    subject: { type: String, default: '' },
    participants: [{ type: String, default: [] }],
    emailIds: [{ type: Schema.Types.ObjectId, ref: 'Email' }],
    latestEmailId: { type: Schema.Types.ObjectId, ref: 'Email', default: null },
    draftIds: [{ type: Schema.Types.ObjectId, ref: 'Draft' }],
    state: {
      type: String,
      enum: ['idle', 'notified', 'awaiting_approval', 'sent', 'cancelled'],
      default: 'idle',
      index: true,
    },
    lastInstruction: { type: String, default: '' },
  },
  { timestamps: true },
);

conversationSchema.index({ state: 1, updatedAt: -1 });

export default mongoose.model('Conversation', conversationSchema);
