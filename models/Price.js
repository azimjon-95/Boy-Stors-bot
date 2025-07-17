const mongoose = require('mongoose');

const PriceSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['premium_3_months', 'premium_6_months', 'premium_12_months', 'star_per_unit'],
        required: true,
        unique: true
    },
    value: {
        type: Number,
        required: true,
        min: 0
    }
});

module.exports = mongoose.model('Price', PriceSchema);