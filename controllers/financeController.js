const Transaction = require("../models/transactionSchema");
const User = require("../models/userSchema");
const asyncHandler = require("express-async-handler");
const paystackService = require("../services/paystack.service");
const mongoose = require("mongoose");

const toPositiveAmount = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Math.round((amount + Number.EPSILON) * 100) / 100 : null;
};

// @desc    Initialize Paystack Payment
// @route   POST /api/finance/deposit/initialize
// @access  Private
const initializeDeposit = asyncHandler(async (req, res) => {
  const { amount, reference: frontendReference } = req.body;
  const user = req.user;

  const dbUser = await User.findById(user._id);
  if (dbUser.kycStatus !== "VERIFIED") {
    return res.status(403).json({ 
      success: false, 
      message: "KYC verification required. Please verify your identity to enable deposits." 
    });
  }

  if (!amount || amount < 1000) {
    return res.status(400).json({ success: false, message: "Minimum deposit amount is NGN 1,000" });
  }

  const cleanReference = frontendReference?.trim();
  console.log(`[Finance] Initializing deposit for user ${user._id} with reference: ${cleanReference}`);

  try {
    const data = await paystackService.initializeTransaction({
      email: user.email,
      amount,
      reference: cleanReference,
      callback_url: `${process.env.FRONTEND_URL}/user/wallet`,
      metadata: {
        userId: user._id,
        type: "Wallet_Topup",
      },
    });

    console.log(`[Finance] Paystack initialized. Reference: ${data.reference}`);

    res.status(200).json({
      success: true,
      message: "Deposit initiated. Please complete payment.",
      data: {
        ...data,
      },
    });
  } catch (error) {
    console.error(" [PAYMENT INIT ERROR]", error.message);
    res.status(500).json({
      success: false,
      message: "Could not initialize payment",
      error: error.message
    });
  }
});



// @desc    Verify Paystack Payment
// @route   GET /api/finance/deposit/verify/:reference
// @access  Private
const verifyDeposit = asyncHandler(async (req, res) => {
  const reference = req.params.reference?.trim();
  const user = req.user;
  console.log(`[Finance] Verifying transaction with ref: ${reference}`);

  try {
    // 1. Check if transaction already exists and is completed in our DB
    let transaction = await Transaction.findOne({ reference });
    if (transaction && transaction.status === "Completed") {
      console.log(`[Finance] Transaction ${reference} already completed in DB.`);
      return res.json({ success: true, message: "Transaction already processed", data: transaction });
    }

    // 2. If it's an instant reference but not completed (shouldn't happen with valid logic)
    if (reference.startsWith("INST-") && (!transaction || transaction.status !== "Completed")) {
      // logic for instant...
    }

    // 3. Verify with Paystack
    const data = await paystackService.verifyTransaction(reference);
    console.log(`[Finance] Paystack verify response for ${reference}: status=${data.status}, amount=${data.amount}`);

    if (data.status === "success") {
      // Re-fetch or use existing to ensure we have the latest state
      if (!transaction) {
        transaction = await Transaction.findOne({ reference });
      }

      if (!transaction) {
        try {
          console.log(`[Finance] Creating NEW transaction record for ref: ${reference}`);
          transaction = await Transaction.create({
            user: user._id,
            amount: data.amount / 100,
            type: "Wallet_Topup",
            status: "Completed",
            reference: reference,
            description: "Wallet Top-up via Paystack",
          });
          
          console.log(`[Finance] Updating balance for user: ${user._id} by ${data.amount / 100}`);
          const updatedUser = await User.findByIdAndUpdate(
            user._id,
            { $inc: { walletBalance: data.amount / 100 } },
            { new: true }
          );
          
          console.log(`[Finance] Balance update result: ${updatedUser ? "Success (New Balance: " + updatedUser.walletBalance + ")" : "FAILED - User not found"}`);
          
          return res.json({ success: true, message: "Payment verified and record created", data: transaction });
        } catch (err) {
          if (err.code === 11000) {
            // If another process created it just now, find it and proceed
            transaction = await Transaction.findOne({ reference });
            if (transaction?.status === "Completed") {
              return res.json({ success: true, message: "Transaction already processed", data: transaction });
            }
          } else {
            throw err;
          }
        }
      }

      // Atomic update to prevent double-crediting/race conditions
      const updatedTransaction = await Transaction.findOneAndUpdate(
        { reference, status: { $ne: "Completed" } },
        { $set: { status: "Completed" } },
        { new: true }
      );

      if (!updatedTransaction) {
        console.log(`[Finance] Transaction ${reference} was already marked as Completed or is being processed.`);
        const existingTx = await Transaction.findOne({ reference });
        return res.json({ success: true, message: "Transaction already processed", data: existingTx });
      }

      console.log(`[Finance] Transaction ${reference} atomically marked as Completed.`);

      // Update user balance atomically
      console.log(`[Finance] Atomic update for existing transaction ${reference}. Target user: ${transaction?.user || user._id}`);
      const depositAmount = data.amount / 100; // Convert back from kobo
      const updatedUser = await User.findByIdAndUpdate(
        transaction?.user || user._id,
        { $inc: { walletBalance: depositAmount } },
        { new: true }
      );

      if (updatedUser) {
        console.log(`[Finance] User balance updated. New balance: ${updatedUser.walletBalance}`);
      } else {
        console.error(`[Finance] FAILED to update balance for user: ${transaction?.user || user._id}`);
      }

      res.status(200).json({
        success: true,
        message: "Payment verified successfully",
        data: updatedTransaction
      });
    } else {
      console.warn(`[Finance] Payment verification returned non-success status: ${data.status}`);
      const transaction = await Transaction.findOne({ reference });
      if (transaction && data.status === "failed") {
        transaction.status = "Failed";
        await transaction.save();
      }

      res.status(400).json({
        success: false,
        message: `Payment verification failed: ${data.status}`,
        data
      });
    }
  } catch (error) {
    console.error(" [PAYMENT VERIFY ERROR]", error.message);
    res.status(500).json({
      success: false,
      message: "Payment verification failed",
      error: error.message
    });
  }
});

// @desc    Get user transactions
// @route   GET /api/finance/transactions
// @access  Private
const getUserTransactions = asyncHandler(async (req, res) => {
  const transactions = await Transaction.find({ user: req.user._id })
    .sort({ createdAt: -1 })
    .limit(50);
  res.json(transactions);
});

// @desc    Get all transactions (Admin)
// @route   GET /api/finance/admin/transactions
// @access  Private/Admin
const getAllTransactions = asyncHandler(async (req, res) => {
  const transactions = await Transaction.find()
    .populate("user", "firstName lastName email userId walletBalance")
    .sort({ createdAt: -1 });
  res.json(transactions);
});

// @desc    Get financial summary (Admin)
// @route   GET /api/finance/admin/summary
// @access  Private/Admin
const getFinancialSummary = asyncHandler(async (req, res) => {
  const stats = await Transaction.aggregate([
    { $match: { status: "Completed" } },
    {
      $group: {
        _id: "$type",
        totalAmount: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
  ]);

  const totalDeposits = stats.find(s => s._id === "Wallet_Topup")?.totalAmount || 0;

  res.json({
    summary: stats,
    totalDeposits,
  });
});

// @desc    Handle Paystack Webhook
// @route   POST /api/finance/webhook
// @access  Public
const handleWebhook = asyncHandler(async (req, res) => {
  const crypto = require("crypto");
  const secret = process.env.PAYSTACK_SECRET_KEY;

  // Verify signature using raw body for maximum security
  const hash = crypto.createHmac("sha512", secret).update(req.rawBody).digest("hex");
  if (hash !== req.headers["x-paystack-signature"]) {
    console.error("[Finance Webhook] Invalid signature detected!");
    return res.status(400).send("Invalid signature");
  }

  const event = req.body;
  console.log(`[Finance Webhook] Received event: ${event.event}`);

  if (event.event === "charge.success") {
    const { reference, amount, metadata } = event.data;
    console.log(`[Finance Webhook] Success for ref: ${reference}, amount: ${amount}`);

    let transaction = await Transaction.findOne({ reference });

    if (!transaction) {
      console.log(`[Finance Webhook] Transaction record NOT FOUND for ref: ${reference}. Creating now from metadata.`);
      const userId = metadata?.userId;
      if (!userId) {
        console.error("[Finance Webhook] No userId found in metadata!");
        return res.status(400).send("No userId in metadata");
      }

      try {
        transaction = await Transaction.create({
          user: userId,
          amount: amount / 100,
          type: "Wallet_Topup",
          status: "Completed",
          reference: reference,
          description: "Wallet top-up (Webhook Created)",
        });

        await User.findByIdAndUpdate(
          userId,
          { $inc: { walletBalance: amount / 100 } }
        );
        console.log(`[Finance Webhook] Created new transaction and updated balance for user ${userId}`);
      } catch (err) {
        if (err.code === 11000) {
          console.log("[Finance Webhook] Transaction record was created by another process, skipping.");
        } else {
          throw err;
        }
      }
    } else {
      // Atomic update to prevent double-crediting
      const updatedTx = await Transaction.findOneAndUpdate(
        { reference, status: { $ne: "Completed" } },
        { $set: { status: "Completed" } },
        { new: true }
      );

      if (updatedTx) {
        const depositAmount = amount / 100;
        await User.findByIdAndUpdate(
          transaction.user,
          { $inc: { walletBalance: depositAmount } }
        );
        console.log(`[Finance Webhook] Transaction ${reference} atomically marked as Completed and balance updated.`);
      } else {
        console.log(`[Finance Webhook] Transaction ${reference} was already completed, skipping balance update.`);
      }
    }
  }

  res.status(200).send("Webhook Received");
});

// @desc    Request Withdrawal
// @route   POST /api/finance/withdrawal/request
// @access  Private
const requestWithdrawal = asyncHandler(async (req, res) => {
  const { amount, bankName, accountNumber, accountName } = req.body;
  const user = req.user;

  if (!amount || amount < 1000) {
    return res.status(400).json({ success: false, message: "Minimum withdrawal amount is NGN 1,000" });
  }

  const session = await mongoose.startSession();

  try {
    let transaction;

    await session.withTransaction(async () => {
      const dbUser = await User.findById(user._id).session(session);
      if (!dbUser) {
        const error = new Error("User not found");
        error.statusCode = 404;
        throw error;
      }

      if (dbUser.kycStatus !== "VERIFIED") {
        const error = new Error("KYC verification required. Please verify your identity to enable withdrawals.");
        error.statusCode = 403;
        throw error;
      }

      if (dbUser.walletBalance < amount) {
        const error = new Error("Insufficient balance");
        error.statusCode = 400;
        throw error;
      }

      // Deduct balance immediately so funds cannot be used while withdrawal is pending
      dbUser.walletBalance -= amount;

      // Update bank details if provided
      if (bankName && accountNumber && accountName) {
        dbUser.bankAccount = { bankName, accountNumber, accountName };
      }

      await dbUser.save({ session });

      const [createdTx] = await Transaction.create([{
        user: user._id,
        amount,
        type: "Withdrawal",
        status: "Pending",
        reference: `WD-${Date.now()}-${Math.random().toString(36).substring(7).toUpperCase()}`,
        description: `Withdrawal request to ${bankName || dbUser.bankAccount?.bankName || "bank account"}`,
        metadata: {
          bankDetails: {
            bankName: bankName || dbUser.bankAccount?.bankName,
            accountNumber: accountNumber || dbUser.bankAccount?.accountNumber,
            accountName: accountName || dbUser.bankAccount?.accountName,
          }
        }
      }], { session });

      transaction = createdTx;
    });

    res.status(201).json({
      success: true,
      message: "Withdrawal request submitted. Funds have been reserved.",
      data: transaction
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : "Withdrawal request could not be completed",
    });
  } finally {
    await session.endSession();
  }
});

// @desc    Process Withdrawal (Admin)
// @route   POST /api/finance/admin/withdrawal/process
// @access  Private/Admin
const processWithdrawal = asyncHandler(async (req, res) => {
  const { transactionId, status, notes } = req.body;

  if (!["Completed", "Failed"].includes(status)) {
    return res.status(400).json({ success: false, message: "Invalid status. Must be Completed or Failed." });
  }

  const session = await mongoose.startSession();

  try {
    let updatedTransaction;

    await session.withTransaction(async () => {
      const transaction = await Transaction.findById(transactionId).session(session);
      if (!transaction || transaction.type !== "Withdrawal") {
        const error = new Error("Withdrawal transaction not found");
        error.statusCode = 404;
        throw error;
      }

      if (transaction.status !== "Pending") {
        const error = new Error("Transaction already processed");
        error.statusCode = 400;
        throw error;
      }

      // Balance was already deducted when the withdrawal was requested.
      // If rejected, refund the amount back to the user's wallet.
      if (status === "Failed") {
        await User.findByIdAndUpdate(
          transaction.user,
          { $inc: { walletBalance: transaction.amount } },
          { session }
        );
      }

      transaction.status = status;
      if (notes) transaction.description += ` - Admin Note: ${notes}`;
      await transaction.save({ session });

      updatedTransaction = transaction;
    });

    res.json({
      success: true,
      message: `Withdrawal request ${status.toLowerCase()} successfully`,
      data: updatedTransaction
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : "Could not process withdrawal",
    });
  } finally {
    await session.endSession();
  }
});

// @desc    Cancel Withdrawal (User)
// @route   POST /api/finance/withdrawal/cancel/:id
// @access  Private
const cancelWithdrawal = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id;

  const session = await mongoose.startSession();

  try {
    let updatedTransaction;

    await session.withTransaction(async () => {
      const transaction = await Transaction.findById(id).session(session);

      if (!transaction || transaction.type !== "Withdrawal") {
        const error = new Error("Withdrawal transaction not found");
        error.statusCode = 404;
        throw error;
      }

      // Ensure the user owns this transaction
      if (transaction.user.toString() !== userId.toString()) {
        const error = new Error("Unauthorized");
        error.statusCode = 403;
        throw error;
      }

      if (transaction.status !== "Pending") {
        const error = new Error("Only pending withdrawals can be cancelled");
        error.statusCode = 400;
        throw error;
      }

      // Refund the amount back to user's wallet
      await User.findByIdAndUpdate(
        userId,
        { $inc: { walletBalance: transaction.amount } },
        { session }
      );

      transaction.status = "Failed";
      transaction.description += " - Cancelled by user";
      await transaction.save({ session });

      updatedTransaction = transaction;
    });

    res.json({
      success: true,
      message: "Withdrawal cancelled. Funds have been returned to your wallet.",
      data: updatedTransaction
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : "Could not cancel withdrawal",
    });
  } finally {
    await session.endSession();
  }
});

// @desc    Move funds between wallet and trading balance
// @route   POST /api/finance/trading/transfer
// @access  Private
const transferTradingFunds = asyncHandler(async (req, res) => {
  const { amount, direction } = req.body;
  const transferAmount = toPositiveAmount(amount);

  if (!transferAmount || !["wallet_to_trading", "trading_to_wallet"].includes(direction)) {
    return res.status(400).json({ success: false, message: "Invalid transfer request" });
  }

  const session = await mongoose.startSession();

  try {
    let updatedUser;
    let transaction;

    await session.withTransaction(async () => {
      const user = await User.findById(req.user._id).session(session);
      if (!user) {
        const error = new Error("User not found");
        error.statusCode = 404;
        throw error;
      }

      if (user.kycStatus !== "VERIFIED") {
        const error = new Error("KYC verification required before moving funds to trading.");
        error.statusCode = 403;
        throw error;
      }

      user.tradingBalance = user.tradingBalance || 0;

      if (direction === "wallet_to_trading") {
        if (user.walletBalance < transferAmount) {
          const error = new Error("Insufficient wallet balance");
          error.statusCode = 400;
          throw error;
        }

        user.walletBalance -= transferAmount;
        user.tradingBalance += transferAmount;
      } else {
        if (user.tradingBalance < transferAmount) {
          const error = new Error("Insufficient trading balance");
          error.statusCode = 400;
          throw error;
        }

        user.tradingBalance -= transferAmount;
        user.walletBalance += transferAmount;
      }

      user.walletBalance = toPositiveAmount(user.walletBalance) || 0;
      user.tradingBalance = toPositiveAmount(user.tradingBalance) || 0;
      updatedUser = await user.save({ session });

      const [createdTransaction] = await Transaction.create([{
        user: req.user._id,
        amount: transferAmount,
        type: direction === "wallet_to_trading" ? "Wallet_To_Trading" : "Trading_To_Wallet",
        status: "Completed",
        reference: `TR-${Date.now()}-${Math.random().toString(36).substring(7).toUpperCase()}`,
        description: direction === "wallet_to_trading"
          ? `Moved NGN ${transferAmount.toLocaleString()} from wallet to trading`
          : `Moved NGN ${transferAmount.toLocaleString()} from trading to wallet`,
      }], { session });

      transaction = createdTransaction;
    });

    res.json({
      success: true,
      message: "Transfer completed successfully",
      walletBalance: updatedUser.walletBalance,
      tradingBalance: updatedUser.tradingBalance,
      transaction,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : "Transfer could not be completed",
    });
  } finally {
    await session.endSession();
  }
});

module.exports = {
  initializeDeposit,
  verifyDeposit,
  getUserTransactions,
  getAllTransactions,
  getFinancialSummary,
  handleWebhook,
  requestWithdrawal,
  processWithdrawal,
  cancelWithdrawal,
  transferTradingFunds,
};
