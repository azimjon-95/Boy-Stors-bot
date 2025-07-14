const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    telegramId: { type: Number, required: true, unique: true },
    phoneNumber: { type: String, required: true },
    username: String,
    firstName: String,
    referralBy: Number, // ← bu yerga qo‘shildi
    starsEarned: { type: Number, default: 0 }, // ← bu ham
    createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('User', userSchema);
