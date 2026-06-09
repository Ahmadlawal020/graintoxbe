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
      enum: ["Deposit", "Withdrawal", "Trade_Buy", "Trade_Sell", "Wallet_Topup", "Wallet_To_Trading", "Trading_To_Wallet"],
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
      sparse: true,
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

transactionSchema.index({ user: 1, createdAt: -1 });
transactionSchema.index({ type: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("Transaction", transactionSchema);
