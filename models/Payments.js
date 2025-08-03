const { Schema, model } = require("mongoose");

const paymentSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    type: {
      type: String,
      required: true,
    },
    starsCount: {
      type: Number,
      default: null,
    },
    months: {
      type: Number,
      default: null,
    },
    transactionId: {
      type: String,
      required: true,
    },
    status: {
      type: Boolean,
      default: true,
    },
    order_id: {
      type: String, // e.g., 00001
      required: true,
      unique: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = model("Payment", paymentSchema);
