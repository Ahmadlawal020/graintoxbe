const Transaction = require("../models/transactionSchema");
const User = require("../models/userSchema");
const Crop = require("../models/cropSchema");
const Trade = require("../models/tradeSchema");
const PriceHistory = require("../models/priceHistorySchema");
const asyncHandler = require("express-async-handler");

// @desc    Execute a trade (Buy/Sell)
// @route   POST /api/finance/trade
// @access  Private
const executeTrade = asyncHandler(async (req, res) => {
  const { symbol, type, amount, price } = req.body;
  const userId = req.user._id;

  if (!symbol || !type || !amount || !price) {
    return res.status(400).json({ message: "Missing trade parameters" });
  }

  const tradeAmount = parseFloat(amount);
  const tradePrice = parseFloat(price);
  const totalCost = tradeAmount * tradePrice;
  const fee = totalCost * 0.001; // 0.1% fee

  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  const crop = await Crop.findOne({ tokenSymbol: symbol });
  if (!crop) {
    return res.status(404).json({ message: "Asset not found" });
  }

  if (type === "buy") {
    if (user.walletBalance < totalCost + fee) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    // Deduct balance
    user.walletBalance -= (totalCost + fee);

    // Update holdings
    const holdingIndex = user.holdings.findIndex(h => h.tokenSymbol === symbol);
    if (holdingIndex > -1) {
      const h = user.holdings[holdingIndex];
      const newAmount = h.amount + tradeAmount;
      h.averagePrice = ((h.averagePrice * h.amount) + (tradePrice * tradeAmount)) / newAmount;
      h.amount = newAmount;
    } else {
      user.holdings.push({
        crop: crop._id,
        tokenSymbol: symbol,
        amount: tradeAmount,
        averagePrice: tradePrice
      });
    }
  } else if (type === "sell") {
    const holdingIndex = user.holdings.findIndex(h => h.tokenSymbol === symbol);
    if (holdingIndex === -1 || user.holdings[holdingIndex].amount < tradeAmount) {
      return res.status(400).json({ message: "Insufficient assets to sell" });
    }

    // Add balance
    user.walletBalance += (totalCost - fee);

    // Update holdings
    user.holdings[holdingIndex].amount -= tradeAmount;
    if (user.holdings[holdingIndex].amount === 0) {
      user.holdings.splice(holdingIndex, 1);
    }
  } else {
    return res.status(400).json({ message: "Invalid trade type" });
  }

  // Save user changes
  await user.save();

  // Record price history (Market Activity)
  await PriceHistory.create({
    crop: crop._id,
    symbol: crop.tokenSymbol,
    price: tradePrice,
    open: crop.pricePerUnit, // previous price
    high: Math.max(crop.pricePerUnit, tradePrice),
    low: Math.min(crop.pricePerUnit, tradePrice),
    close: tradePrice,
    volume: tradeAmount
  });

  // Update crop current price
  crop.pricePerUnit = tradePrice;
  await crop.save();

  // Create dedicated Trade record (Persistent History)
  const trade = await Trade.create({
    user: userId,
    crop: crop._id,
    symbol,
    type,
    amount: tradeAmount,
    price: tradePrice,
    total: totalCost,
    fee,
    status: "Completed"
  });

  // Create transaction record (Wallet History)
  const transaction = await Transaction.create({
    user: userId,
    amount: totalCost,
    type: type === "buy" ? "Trade_Buy" : "Trade_Sell",
    status: "Completed",
    description: `${type.toUpperCase()} ${tradeAmount} ${symbol} @ ₦${tradePrice.toLocaleString()}`,
    metadata: {
      tradeId: trade._id,
      symbol,
      price: tradePrice,
      amount: tradeAmount,
      fee
    }
  });

  res.status(200).json({
    success: true,
    message: `Trade ${type} executed successfully`,
    trade,
    transaction,
    newBalance: user.walletBalance
  });
});

// @desc    Get user trade history
// @route   GET /api/finance/trades
// @access  Private
const getUserTrades = asyncHandler(async (req, res) => {
  const trades = await Trade.find({ user: req.user._id })
    .sort({ createdAt: -1 });
  res.json(trades);
});

// @desc    Get all trades (Admin)
// @route   GET /api/finance/admin/trades
// @access  Private/Admin
const getAllTrades = asyncHandler(async (req, res) => {
  const trades = await Trade.find()
    .populate("user", "firstName lastName email userId")
    .populate("crop", "name tokenSymbol")
    .sort({ createdAt: -1 });
  res.json(trades);
});

module.exports = {
  executeTrade,
  getUserTrades,
  getAllTrades
};
