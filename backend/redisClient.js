const redis = require('redis');

const client = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 10) return new Error('Max retries reached');
      return Math.min(retries * 100, 3000);
    }
  }
});

client.on('error', (err) => console.error('[Redis] Client Error:', err));
client.on('connect', () => console.log('[Redis] Connecting...'));
client.on('ready', () => console.log('[Redis] Connected and Ready'));

(async () => {
  try {
    await client.connect();
  } catch (err) {
    console.error('[Redis] Failed to connect initially. Will retry.', err.message);
  }
})();

module.exports = client;