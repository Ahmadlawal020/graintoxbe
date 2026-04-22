const mongoose = require("mongoose");

const tradeSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    crop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Crop",
      required: true,
    },
    symbol: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ["buy", "sell"],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    total: {
      type: Number,
      required: true,
    },
    fee: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["Pending", "Completed", "Cancelled", "Failed"],
      default: "Completed",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Trade", tradeSchema);
