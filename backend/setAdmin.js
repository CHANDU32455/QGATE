const mongoose = require('mongoose');
const User = require('./User');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/qgate';

async function setAdmin(regUserId) {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB');

        const user = await User.findOne({ regUserId });
        if (!user) {
            console.error(`User with ID ${regUserId} not found`);
            process.exit(1);
        }

        user.role = 'admin';
        await user.save();
        console.log(`Successfully set user ${user.username} (${regUserId}) as ADMIN 🛡️`);
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

const regId = process.argv[2];
if (!regId) {
    console.log('Usage: node setAdmin.js <regUserId>');
    process.exit(1);
}

setAdmin(regId);
