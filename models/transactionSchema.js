const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    type: {
      type: String,
      enum: ["Deposit", "Withdrawal", "Trade_Buy", "Trade_Sell", "Wallet_Topup"],
      required: true,
    },
    status: {
      type: String,
      enum: ["Pending", "Completed", "Failed"],
      default: "Pending",
    },
    reference: {
      type: String, // Paystack reference
      unique: true,
    },
    paymentMethod: {
      type: String,
      default: "Paystack",
    },
    description: String,
    metadata: Object,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Transaction", transactionSchema);
