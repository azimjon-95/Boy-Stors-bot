const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('🟢 MongoDB ulandi');
    } catch (error) {
        console.error('🔴 MongoDB xatolik:', error.message);
    }
};

module.exports = connectDB;
