const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  regUserId: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  pq_pub_key: { type: Buffer, required: true, unique: true },
  role: { type: String, default: 'user' },
  encrypted_vault: { type: String }, // Encrypted PQC seed for recovery
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);