const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');
const authRoutes = require('./auth');

const app = express();
const server = http.createServer(app);

// Middleware
// 1. Security Headers
app.use(helmet());

// 2. CORS (Allow specific origins in production)
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:3000'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV !== 'production') {
      callback(null, true);
    } else {
      console.warn(`[CORS] Blocked request from unauthorized origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json());

// 2a. Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), env: process.env.NODE_ENV || 'development' });
});

// 3. Rate Limiting (Prevent DoS attacks)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);

// 4. Trust Proxy (Required for AWS Load Balancers/Heroku/Nginx)
app.set('trust proxy', 1);

// Database Connection
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/qgate')
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.error('MongoDB Error:', err));

// Socket.io Setup
const io = new Server(server, {
  cors: { origin: "*" }
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  // Frontend emits 'join' with the sessionId when it wants to subscribe
  socket.on('join', (sessionId) => {
    socket.join(sessionId);
    console.log(`Socket ${socket.id} joined session ${sessionId}`);
  });

  socket.on('joinUser', (userId) => {
    socket.join(`user:${userId}`);
    console.log(`Socket ${socket.id} joined user room user:${userId}`);
  });
});

// Health endpoint for QRNG
app.get('/health/qrng', async (req, res) => {
  try {
    const { getRandomBytes } = require('./qrng');
    const r = await getRandomBytes(16);
    res.json({ ok: true, source: r.source });
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  }
});

// Make io available in routes
app.set('io', io);

// Routes
app.use('/api', authRoutes);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));