const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const User = require('./User');
const redisClient = require('./redisClient');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/qgate';

async function cleanDB() {
    try {
        console.log('--- Database Cleanup Started ---');

        // 1. Connect MongoDB
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB');

        // 2. Clear MongoDB Users
        const deleteRes = await User.deleteMany({});
        console.log(`✅ MongoDB: Deleted ${deleteRes.deletedCount} users.`);

        // 3. Clear Redis
        // We wait a bit for redisClient to connect (it connects on require)
        if (!redisClient.isOpen) {
            await redisClient.connect();
        }
        await redisClient.flushAll();
        console.log('✅ Redis: Flushed all keys (sessions, nonces cleared).');

        console.log('--- Cleanup Complete! System is pristine. ---');
        process.exit(0);
    } catch (err) {
        console.error('❌ Cleanup Failed:', err);
        process.exit(1);
    }
}

cleanDB();
