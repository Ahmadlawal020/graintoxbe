const mongoose = require("mongoose");

const priceHistorySchema = new mongoose.Schema(
  {
    crop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Crop",
      required: true,
    },
    symbol: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    open: Number,
    high: Number,
    low: Number,
    close: Number,
    volume: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PriceHistory", priceHistorySchema);
