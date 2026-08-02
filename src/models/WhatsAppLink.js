import mongoose from 'mongoose';

const { Schema } = mongoose;

const whatsAppLinkSchema = new Schema(
  {
    waMessageId: { type: String, required: true, unique: true, index: true },
    emailId: { type: Schema.Types.ObjectId, ref: 'Email', index: true },
    draftId: { type: Schema.Types.ObjectId, ref: 'Draft', default: null },
    type: {
      type: String,
      enum: ['notification', 'draft', 'sent_confirmation', 'status'],
      default: 'notification',
    },
  },
  { timestamps: true },
);

export default mongoose.model('WhatsAppLink', whatsAppLinkSchema);
