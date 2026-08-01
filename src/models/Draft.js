import mongoose from 'mongoose';
import { attachmentSchema } from './Email.js';

const { Schema } = mongoose;

const draftSchema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', index: true },
    emailId: { type: Schema.Types.ObjectId, ref: 'Email', index: true },
    subject: { type: String, default: '' },
    body: { type: String, default: '' },
    signature: { type: String, default: '' },
    instructions: { type: String, default: '' },
    attachments: [attachmentSchema],
    status: {
      type: String,
      enum: ['draft', 'generated', 'approved', 'cancelled', 'sent', 'failed'],
      default: 'draft',
      index: true,
    },
    sentAt: { type: Date, default: null },
  },
  { timestamps: true },
);

draftSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('Draft', draftSchema);
