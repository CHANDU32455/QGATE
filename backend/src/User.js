const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  regUserId: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  pq_pub_key: { type: Buffer, required: true, unique: true },
  role: { type: String, enum: ['admin', 'promoted_admin', 'user'], default: 'user' },
  status: { type: String, enum: ['active', 'locked', 'pending_recovery'], default: 'active' },
  lastRecoveryAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);