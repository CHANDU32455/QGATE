const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const User = require('./User');
const redisClient = require('./redisClient');
const { verifyPQ } = require('./pqCrypto');
const qrcode = require('qrcode-terminal');
const { getRandomBytes } = require('./qrng');
const pkg = require('@asanrom/dilithium');
const { DilithiumLevel, DILITHIUM_LEVEL3_P, DilithiumKeyPair } = pkg;
const level3 = new DilithiumLevel(DILITHIUM_LEVEL3_P);
const rateLimit = require('express-rate-limit');

// --- MIDDLEWARE ---
const adminOnly = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

    const token = authHeader.split(' ')[1];
    const sessionData = await redisClient.get(`session:${token}`);
    if (!sessionData) return res.status(401).json({ error: 'Session expired' });

    const user = JSON.parse(sessionData);
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }

    req.adminUser = user;
    next();
  } catch (err) {
    console.error('[Backend] adminOnly middleware error:', err);
    res.status(500).json({ error: 'Middleware error' });
  }
};

const regLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

// --- 1a. REGISTER INITIATE ---
router.post('/register/initiate', regLimiter, async (req, res) => {
  const start = Date.now();
  console.log('[Backend] /API/REGISTER/INITIATE - Start');
  try {
    const regSessionId = uuidv4();
    const { bytes: nonceBytes, source } = await getRandomBytes(32);
    const regNonce = nonceBytes.toString('base64');

    await redisClient.setEx(`reg_session:${regSessionId}`, 600, regNonce);

    console.log(`[Backend] /API/REGISTER/INITIATE - Success (${Date.now() - start}ms)`);
    res.json({ regSessionId, regNonce });
  } catch (err) {
    console.error('[Backend] Registration Initiation Error:', err);
    res.status(500).json({ error: 'Failed to initiate registration' });
  }
});

// 2. Complete Registration (Key & Identity Binding)
router.post('/register', async (req, res) => {
  const start = Date.now();
  console.log('[Backend] /API/REGISTER - Start');
  const { username, publicKey, regSessionId, attestation } = req.body;

  if (!username || !publicKey || !regSessionId) {
    return res.status(400).json({ error: 'Missing registration parameters' });
  }

  try {
    const expectedNonce = await redisClient.get(`reg_session:${regSessionId}`);
    if (!expectedNonce) {
      return res.status(401).json({ error: 'Invalid or expired registration session' });
    }

    const { verifyAndroidAttestation } = require('./attestation');
    const attRes = await verifyAndroidAttestation(attestation, expectedNonce);
    if (!attRes.ok) {
      return res.status(401).json({ error: `Attestation failed: ${attRes.error}` });
    }

    const pubKeyBuffer = Buffer.from(publicKey, 'base64');

    // 1. Check if this KEY is already registered (Same Device)
    const existingDevice = await User.findOne({ pq_pub_key: pubKeyBuffer });
    if (existingDevice) {
      return res.status(409).json({
        error: 'DEVICE_ALREADY_REGISTERED',
        username: existingDevice.username,
        regUserId: existingDevice.regUserId,
        message: `This device is already registered with username: ${existingDevice.username}. Please go to Login.`
      });
    }

    // 2. Check if this USERNAME is already taken (Different Device)
    const existingUser = await User.findOne({ username: { $regex: new RegExp(`^${username}$`, 'i') } });
    if (existingUser) {
      return res.status(409).json({
        error: 'USERNAME_TAKEN',
        message: `The username "${username}" is already taken. Please choose another.`
      });
    }

    const regUserId = `QID-${crypto.createHash('sha256').update(pubKeyBuffer).digest('hex').slice(0, 12).toUpperCase()}`;

    // Bootstrap: First user is admin
    const userCount = await User.countDocuments();
    const role = userCount === 0 ? 'admin' : 'user';

    const newUser = new User({
      regUserId,
      username,
      pq_pub_key: pubKeyBuffer,
      role
    });
    await newUser.save();

    await redisClient.del(`reg_session:${regSessionId}`);
    res.json({ success: true, regUserId });
  } catch (err) {
    console.error('[Backend] Registration error:', err);
    res.status(500).json({ error: 'Registration failed internal error' });
  }
});

// --- ADMIN ROUTES (Management) ---
router.get('/admin/users', adminOnly, async (req, res) => {
  try {
    const users = await User.find({}, 'regUserId username role createdAt');
    res.json(users);
  } catch (err) {
    console.error('[Backend] Admin get users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.delete('/admin/users/:regUserId', adminOnly, async (req, res) => {
  try {
    const result = await User.deleteOne({ regUserId: req.params.regUserId });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'User not found' });
    console.log(`[Backend] Admin ${req.adminUser.username} deleted user: ${req.params.regUserId}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[Backend] Admin delete user error:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

router.patch('/admin/users/:regUserId/role', adminOnly, async (req, res) => {
  try {
    const { role } = req.body;
    if (!['admin', 'user'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Enforce Max 5 Admins
    if (role === 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin' });
      if (adminCount >= 5) {
        return res.status(400).json({ error: 'Administrator limit reached (Max 5)' });
      }
    }

    const user = await User.findOneAndUpdate({ regUserId: req.params.regUserId }, { role }, { new: true });
    if (!user) return res.status(404).json({ error: 'User not found' });
    console.log(`[Backend] Admin ${req.adminUser.username} updated role for ${user.username} to ${role}`);
    res.json({ success: true, role: user.role });
  } catch (err) {
    console.error('[Backend] Admin update role error:', err);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// --- 1c. IDENTITY SYNC (SELF-HEALING) ---
router.post('/mobile/sync', async (req, res) => {
  try {
    const { publicKey } = req.body;
    if (!publicKey) return res.status(400).json({ error: 'Missing public key' });

    const pubKeyBuffer = Buffer.from(publicKey, 'base64');
    const user = await User.findOne({ pq_pub_key: pubKeyBuffer });

    if (!user) {
      return res.status(404).json({ error: 'Identity not found on server' });
    }

    console.log(`[Backend] /mobile/sync - Restored identity for: ${user.username}`);
    res.json({
      regUserId: user.regUserId,
      username: user.username
    });
  } catch (err) {
    console.error('[Backend] Identity Sync Error:', err);
    res.status(500).json({ error: 'Internal server error during sync' });
  }
});

// --- 1d. IDENTITY RECOVERY (Sync from Mnemonic/Key) ---
router.post('/recover', async (req, res) => {
  try {
    const { publicKey, regSessionId, attestation } = req.body;
    if (!publicKey || !regSessionId) return res.status(400).json({ error: 'Missing parameters' });

    const expectedNonce = await redisClient.get(`reg_session:${regSessionId}`);
    if (!expectedNonce) return res.status(401).json({ error: 'Invalid or expired session' });

    // Verify attestation for recovery too
    const { verifyAndroidAttestation } = require('./attestation');
    const attRes = await verifyAndroidAttestation(attestation, expectedNonce);
    if (!attRes.ok) return res.status(401).json({ error: `Attestation failed: ${attRes.error}` });

    const pubKeyBuffer = Buffer.from(publicKey, 'base64');
    const user = await User.findOne({ pq_pub_key: pubKeyBuffer });

    if (!user) {
      return res.status(404).json({ error: 'No identity found for this key. Was this registered?' });
    }

    console.log(`[Backend] /recover - Identity restored for: ${user.username}`);
    await redisClient.del(`reg_session:${regSessionId}`);

    res.json({
      success: true,
      regUserId: user.regUserId,
      username: user.username
    });
  } catch (err) {
    console.error('[Backend] Identity Recovery Error:', err);
    res.status(500).json({ error: 'Internal server error during recovery' });
  }
});

// --- 2. INITIATE ---
router.post('/initiate', async (req, res) => {
  try {
    const { regUserId: idInput } = req.body;
    if (!idInput) return res.status(400).json({ error: 'Missing Identity/Username' });
    const user = await User.findOne({
      $or: [
        { regUserId: idInput },
        { username: { $regex: new RegExp(`^${idInput}$`, 'i') } }
      ]
    }).sort({ createdAt: -1 });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const regUserId = user.regUserId;
    const sessionId = uuidv4();
    const { bytes: nonceBytes } = await getRandomBytes(32);
    const nonce = nonceBytes.toString('base64');
    await redisClient.setEx(`challenge:${sessionId}`, 120, JSON.stringify({ regUserId, nonce }));
    res.json({ sessionId, nonce });
  } catch (err) {
    res.status(500).json({ error: 'Initiate error' });
  }
});

// --- 3. VERIFY ---
router.post('/verify', async (req, res) => {
  try {
    const { sessionId, signature } = req.body;
    const raw = await redisClient.get(`challenge:${sessionId}`);
    if (!raw) return res.status(401).json({ error: 'Expired or invalid session' });
    const { regUserId, nonce } = JSON.parse(raw);
    const user = await User.findOne({ regUserId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const isValid = verifyPQ(nonce, signature, user.pq_pub_key);
    if (!isValid) {
      console.warn(`[Backend] /verify - Signature check FAILED for user: ${user.username}`);
      return res.status(401).json({ error: 'Quantum signature verification failed' });
    }
    console.log(`[Backend] /verify - Signature check SUCCESS for user: ${user.username}`);
    const sessionToken = crypto.randomUUID();
    await redisClient.setEx(`session:${sessionToken}`, 3600, JSON.stringify({
      userId: user.regUserId,
      username: user.username,
      role: user.role || 'user',
      status: 'authenticated',
      issuedAt: new Date().toISOString()
    }));
    // Track session in user's set for management
    await redisClient.sAdd(`user_sessions:${user.regUserId}`, sessionToken);
    await redisClient.expire(`user_sessions:${user.regUserId}`, 3600);

    await redisClient.del(`challenge:${sessionId}`);

    // Notify all user's devices that sessions have changed
    const io = req.app.get('io');
    io.to(`user:${user.regUserId}`).emit('sessions_updated');

    res.json({ status: 'ok', token: sessionToken });
  } catch (err) {
    res.status(500).json({ error: 'Verify error' });
  }
});

// --- 4. MOBILE VERIFY (RemoteAuth) ---
router.post('/mobile/verify', async (req, res) => {
  try {
    const { sessionId, regUserId, signature } = req.body;
    const raw = await redisClient.get(`challenge:${sessionId}`);
    if (!raw) return res.status(401).json({ error: 'Expired or invalid session' });
    const { nonce } = JSON.parse(raw);
    const user = await User.findOne({ regUserId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const isValid = verifyPQ(nonce, signature, user.pq_pub_key);
    if (!isValid) {
      console.warn(`[Backend] /mobile/verify - Signature check FAILED for user: ${user.username}`);
      return res.status(401).json({ error: 'Quantum verification failed' });
    }
    console.log(`[Backend] /mobile/verify - Signature check SUCCESS for user: ${user.username}`);
    const sessionToken = crypto.randomUUID();
    await redisClient.setEx(`session:${sessionToken}`, 3600, JSON.stringify({
      userId: regUserId,
      username: user.username,
      role: user.role || 'user',
      status: 'authenticated',
      issuedAt: new Date().toISOString()
    }));
    await redisClient.sAdd(`user_sessions:${regUserId}`, sessionToken);
    await redisClient.expire(`user_sessions:${regUserId}`, 3600);
    await redisClient.del(`challenge:${sessionId}`);
    const io = req.app.get('io');
    io.to(sessionId).emit('authenticated', sessionToken);
    // Also notify all user's devices
    io.to(`user:${regUserId}`).emit('sessions_updated');
    res.json({ status: 'ok', token: sessionToken });
  } catch (err) {
    res.status(500).json({ error: 'Mobile verify error' });
  }
});

// --- 5. SESSION MANAGEMENT ---
router.get('/sessions', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.split(' ')[1];
    const data = await redisClient.get(`session:${token}`);
    if (!data) return res.status(401).json({ error: 'Expired' });
    const { userId } = JSON.parse(data);
    const tokens = await redisClient.sMembers(`user_sessions:${userId}`);
    const details = [];
    for (const t of tokens) {
      const s = await redisClient.get(`session:${t}`);
      if (s) details.push({ token: t, ...JSON.parse(s), isCurrent: t === token });
      else await redisClient.sRem(`user_sessions:${userId}`, t);
    }
    res.json(details);
  } catch (err) {
    res.status(500).json({ error: 'Sessions error' });
  }
});

router.delete('/sessions/:token', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
    const currentToken = authHeader.split(' ')[1];
    const me = await redisClient.get(`session:${currentToken}`);
    if (!me) return res.status(401).json({ error: 'Expired' });
    const { userId } = JSON.parse(me);
    const targetToken = req.params.token;
    const target = await redisClient.get(`session:${targetToken}`);
    if (target && JSON.parse(target).userId === userId) {
      await redisClient.del(`session:${targetToken}`);
      await redisClient.sRem(`user_sessions:${userId}`, targetToken);

      // Notify all user's devices
      const io = req.app.get('io');
      io.to(`user:${userId}`).emit('sessions_updated');

      res.json({ success: true });
    } else res.status(403).json({ error: 'Forbidden' });
  } catch (err) {
    res.status(500).json({ error: 'Revoke error' });
  }
});

router.get('/me', async (req, res) => {
  try {
    const h = req.headers.authorization;
    if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing' });
    const t = h.split(' ')[1];
    const d = await redisClient.get(`session:${t}`);
    if (!d) return res.status(401).json({ error: 'Expired' });
    res.json(JSON.parse(d));
  } catch (err) {
    res.status(500).json({ error: 'Me error' });
  }
});

module.exports = router;