import mongoose from 'mongoose';

export const ROLES = Object.freeze(['buyer', 'vendor', 'delivery_agent', 'admin']);
export const STATUSES = Object.freeze([
  'active',
  'pending_approval',
  'rejected',
  'suspended',
  'deactivated',
  'deleted',
]);
// Statuses that may authenticate. Suspended/rejected/deactivated/deleted accounts cannot.
export const LOGIN_ALLOWED = Object.freeze(['active', 'pending_approval']);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    phone: { type: String, trim: true, maxlength: 20 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true, index: true },
    status: { type: String, enum: STATUSES, required: true, index: true },
    failedLoginCount: { type: Number, default: 0 },
    lockUntil: { type: Date },
    passwordChangedAt: { type: Date },
    lastLoginAt: { type: Date },
    resetTokenHash: { type: String, select: false },
    resetTokenExpires: { type: Date, select: false },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ createdAt: -1 });

userSchema.set('toJSON', {
  transform(_doc, ret) {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    delete ret.passwordHash;
    delete ret.resetTokenHash;
    delete ret.resetTokenExpires;
    delete ret.failedLoginCount;
    delete ret.lockUntil;
    return ret;
  },
});

export default mongoose.model('User', userSchema);
