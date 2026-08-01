import mongoose from 'mongoose';

const { Schema } = mongoose;

export const attachmentSchema = new Schema(
  {
    filename: { type: String },
    contentType: { type: String, default: 'application/octet-stream' },
    size: { type: Number, default: 0 },
    path: { type: String },
    contentId: { type: String, default: null },
  },
  { _id: false },
);

const recipientSchema = new Schema(
  {
    name: { type: String, default: null },
    address: { type: String, required: true },
    type: { type: String, enum: ['to', 'cc', 'bcc'], default: 'to' },
  },
  { _id: false },
);

const emailSchema = new Schema(
  {
    messageId: { type: String, unique: true, index: true },
    imapUid: { type: Number },
    threadId: { type: String, index: true },
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      index: true,
    },
    from: {
      name: { type: String, default: null },
      address: { type: String, default: null },
    },
    recipients: [recipientSchema],
    subject: { type: String, default: '' },
    bodyText: { type: String, default: '' },
    bodyHtml: { type: String, default: '' },
    date: { type: Date, default: Date.now },
    attachments: [attachmentSchema],

    category: { type: String, default: null },
    priority: { type: String, default: null },
    action: { type: String, default: null },
    importance: { type: Boolean, default: false },
    summary: { type: String, default: '' },
    suggestedAction: { type: String, default: '' },

    status: {
      type: String,
      enum: [
        'new',
        'processed',
        'notified',
        'awaiting_approval',
        'sent',
        'ignored',
        'archived',
        'duplicate',
        'failed',
      ],
      default: 'new',
      index: true,
    },
    replyDraftId: { type: Schema.Types.ObjectId, ref: 'Draft', default: null },
  },
  { timestamps: true },
);

emailSchema.index({ date: -1 });
emailSchema.index({ status: 1, date: -1 });

export default mongoose.model('Email', emailSchema);
