const { Schema, model } = require("mongoose");

const counterSchema = new Schema({
    name: { type: String, required: true, unique: true },
    seq: { type: Number, default: 0 },
});

module.exports = model("Counter", counterSchema);
