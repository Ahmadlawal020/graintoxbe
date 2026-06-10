const Transaction = require("../models/transactionSchema");
const User = require("../models/userSchema");
const Crop = require("../models/cropSchema");
const Trade = require("../models/tradeSchema");
const PriceHistory = require("../models/priceHistorySchema");
const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");

const TRADE_FEE_RATE = 0.001;
const MAX_TRADE_AMOUNT = parseFloat(process.env.MAX_TRADE_AMOUNT) || 1000000;
const MAX_SLIPPAGE_BPS = parseInt(process.env.MAX_TRADE_SLIPPAGE_BPS, 10) || 500;

const toPositiveNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

const roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

const assertClientPriceWithinSlippage = (clientPrice, marketPrice) => {
  if (!clientPrice) return;

  const allowedMove = marketPrice * (MAX_SLIPPAGE_BPS / 10000);
  if (Math.abs(clientPrice - marketPrice) > allowedMove) {
    const pct = MAX_SLIPPAGE_BPS / 100;
    const error = new Error(`Market price moved more than ${pct}%. Please refresh and try again.`);
    error.statusCode = 409;
    throw error;
  }
};

const httpError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

// @desc    Execute a trade (Buy/Sell)
// @route   POST /api/finance/trade
// @access  Private
const executeTrade = asyncHandler(async (req, res) => {
  const { symbol, type, amount, price } = req.body;
  const userId = req.user._id;

  const tokenSymbol = typeof symbol === "string" ? symbol.trim().toUpperCase() : "";
  const tradeAmount = toPositiveNumber(amount);
  const clientPrice = toPositiveNumber(price);

  if (!tokenSymbol || !["buy", "sell"].includes(type) || !tradeAmount) {
    return res.status(400).json({ success: false, message: "Invalid trade parameters" });
  }

  if (tradeAmount > MAX_TRADE_AMOUNT) {
    return res.status(400).json({
      success: false,
      message: `Trade amount exceeds the maximum of ${MAX_TRADE_AMOUNT}`,
    });
  }

  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(async () => {
      const user = await User.findById(userId).session(session);
      const crop = await Crop.findOne({ tokenSymbol }).session(session);

      if (!user) throw httpError("User not found", 404);
      if (user.status !== "Active" || user.isActive === false) throw httpError("Account is not active", 403);
      if (user.kycStatus !== "VERIFIED") throw httpError("KYC verification required before trading.", 403);
      if (!crop) throw httpError("Asset not found", 404);

      const tradePrice = toPositiveNumber(crop.pricePerUnit);
      if (!tradePrice) throw httpError("Asset is not currently tradeable", 400);

      assertClientPriceWithinSlippage(clientPrice, tradePrice);

      const totalCost = roundMoney(tradeAmount * tradePrice);
      const fee = roundMoney(totalCost * TRADE_FEE_RATE);
      user.tradingBalance = user.tradingBalance || 0;
      const balanceDelta = type === "buy" ? -(totalCost + fee) : totalCost - fee;
      const holdingIndex = user.holdings.findIndex((holding) => holding.tokenSymbol === tokenSymbol);

      if (type === "buy") {
        if (user.tradingBalance < totalCost + fee) throw httpError("Insufficient trading balance", 400);

        user.tradingBalance = roundMoney(user.tradingBalance + balanceDelta);

        if (holdingIndex > -1) {
          const holding = user.holdings[holdingIndex];
          const newAmount = holding.amount + tradeAmount;
          holding.averagePrice = roundMoney(
            ((holding.averagePrice * holding.amount) + (tradePrice * tradeAmount)) / newAmount
          );
          holding.amount = newAmount;
        } else {
          user.holdings.push({
            crop: crop._id,
            tokenSymbol,
            amount: tradeAmount,
            averagePrice: tradePrice,
          });
        }
      } else {
        if (holdingIndex === -1 || user.holdings[holdingIndex].amount < tradeAmount) {
          throw httpError("Insufficient assets to sell", 400);
        }

        user.tradingBalance = roundMoney(user.tradingBalance + balanceDelta);
        user.holdings[holdingIndex].amount -= tradeAmount;

        if (user.holdings[holdingIndex].amount <= 0) {
          user.holdings.splice(holdingIndex, 1);
        }
      }

      await user.save({ session });

      await PriceHistory.create([{
        crop: crop._id,
        symbol: crop.tokenSymbol,
        price: tradePrice,
        open: crop.pricePerUnit,
        high: crop.pricePerUnit,
        low: crop.pricePerUnit,
        close: tradePrice,
        volume: tradeAmount,
      }], { session });

      const [trade] = await Trade.create([{
        user: userId,
        crop: crop._id,
        symbol: tokenSymbol,
        type,
        amount: tradeAmount,
        price: tradePrice,
        total: totalCost,
        fee,
        status: "Completed",
      }], { session });

      const [transaction] = await Transaction.create([{
        user: userId,
        amount: totalCost,
        type: type === "buy" ? "Trade_Buy" : "Trade_Sell",
        status: "Completed",
        reference: `TD-${Date.now()}-${Math.random().toString(36).substring(7).toUpperCase()}`,
        description: `${type.toUpperCase()} ${tradeAmount} ${tokenSymbol} @ NGN ${tradePrice.toLocaleString()}`,
        metadata: {
          tradeId: trade._id,
          symbol: tokenSymbol,
          price: tradePrice,
          amount: tradeAmount,
          fee,
        },
      }], { session });

      result = {
        trade,
        transaction,
        newBalance: user.tradingBalance,
      };
    });

    res.status(200).json({
      success: true,
      message: `Trade ${type} executed successfully`,
      ...result,
    });
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({
      success: false,
      message: status === 500 ? "Trade could not be completed" : error.message,
    });
  } finally {
    await session.endSession();
  }
});

// @desc    Get user trade history
// @route   GET /api/finance/trades
// @access  Private
const getUserTrades = asyncHandler(async (req, res) => {
  const trades = await Trade.find({ user: req.user._id })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  res.json(trades);
});

// @desc    Get all trades (Admin)
// @route   GET /api/finance/admin/trades
// @access  Private/Admin
const getAllTrades = asyncHandler(async (req, res) => {
  const trades = await Trade.find()
    .populate("user", "firstName lastName email userId")
    .populate("crop", "name tokenSymbol")
    .sort({ createdAt: -1 })
    .limit(250)
    .lean();
  res.json(trades);
});

module.exports = {
  executeTrade,
  getUserTrades,
  getAllTrades,
};
