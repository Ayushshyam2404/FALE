import mongoose from 'mongoose';

const { Schema } = mongoose;

const stateSchema = new Schema(
  {
    key: { type: String, unique: true, index: true },
    value: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

export default mongoose.model('State', stateSchema);
