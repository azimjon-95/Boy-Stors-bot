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
    },
    status: {
      type: Boolean,
      default: false,
    },
    order_id: {
      type: String,
      required: true,
      unique: true,
      match: [/^\d{5}$/, "Order ID must be exactly 5 digits (e.g., 00001)"],
    },
  },
  {
    timestamps: true,
  }
);

module.exports = model("Payment", paymentSchema);
