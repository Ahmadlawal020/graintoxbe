const mongoose = require("mongoose");

const settingsSchema = new mongoose.Schema(
  {
    tradingFeePercentage: { type: Number, default: 2.5 },
    withdrawalFeePercentage: { type: Number, default: 1.0 },
    baseCurrency: { type: String, default: "NGN" },
    kycRequiredForTrade: { type: Boolean, default: true },
    kycRequiredForDeposit: { type: Boolean, default: false },
    maintenanceMode: { type: Boolean, default: false },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Settings", settingsSchema);
