const Transaction = require("../models/transactionSchema");
const User = require("../models/userSchema");
const asyncHandler = require("express-async-handler");
const paystackService = require("../services/paystack.service");

// @desc    Initialize Paystack Payment
// @route   POST /api/finance/deposit/initialize
// @access  Private
const initializeDeposit = asyncHandler(async (req, res) => {
  const { amount, reference: frontendReference } = req.body;
  const user = req.user;

  if (!amount || amount <= 0) {
    return res.status(400).json({ success: false, message: "Invalid amount" });
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

// @desc    Instant Deposit (Bypass Paystack for testing)
// @route   POST /api/finance/deposit/instant
// @access  Private
const instantDeposit = asyncHandler(async (req, res) => {
  const { amount } = req.body;
  const user = req.user;

  if (process.env.NODE_ENV === "Production") {
    return res.status(403).json({ success: false, message: "Instant deposit is only available in Development mode" });
  }

  if (!amount || amount <= 0) {
    return res.status(400).json({ success: false, message: "Invalid amount" });
  }

  console.log(`[Finance] Processing instant deposit for user ${user._id} amount: ${amount}`);

  const reference = `INST-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Create a completed transaction record
  const transaction = await Transaction.create({
    user: user._id,
    amount: amount,
    type: "Wallet_Topup",
    status: "Completed",
    reference,
    description: "Instant Wallet Top-up (Bypass)",
  });

  // Update user balance atomically
  const updatedUser = await User.findByIdAndUpdate(
    user._id,
    { $inc: { walletBalance: amount } },
    { new: true }
  );

  console.log(`[Finance] User ${user._id} balance updated instantly. New balance: ${updatedUser.walletBalance}`);

  res.status(200).json({
    success: true,
    message: "Instant deposit successful",
    data: transaction
  });
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

  if (!amount || amount <= 0) {
    return res.status(400).json({ success: false, message: "Invalid amount" });
  }

  // Check if user has sufficient balance
  const dbUser = await User.findById(user._id);
  if (dbUser.walletBalance < amount) {
    return res.status(400).json({ success: false, message: "Insufficient balance" });
  }

  // Create pending transaction without deducting balance yet
  // We only check if they HAVE enough right now to prevent frivolous requests
  const transaction = await Transaction.create({
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
  });

  // Update bank details if provided
  if (bankName && accountNumber && accountName) {
    dbUser.bankAccount = { bankName, accountNumber, accountName };
    await dbUser.save();
  }

  res.status(201).json({
    success: true,
    message: "Withdrawal request submitted successfully",
    data: transaction
  });
});

// @desc    Process Withdrawal (Admin)
// @route   POST /api/finance/admin/withdrawal/process
// @access  Private/Admin
const processWithdrawal = asyncHandler(async (req, res) => {
  const { transactionId, status, notes } = req.body;

  if (!["Completed", "Failed"].includes(status)) {
    return res.status(400).json({ success: false, message: "Invalid status. Must be Completed or Failed." });
  }

  const transaction = await Transaction.findById(transactionId);
  if (!transaction || transaction.type !== "Withdrawal") {
    return res.status(404).json({ success: false, message: "Withdrawal transaction not found" });
  }

  if (transaction.status !== "Pending") {
    return res.status(400).json({ success: false, message: "Transaction already processed" });
  }

  // If approved, deduct the user's balance
  if (status === "Completed") {
    const user = await User.findById(transaction.user);
    if (!user || user.walletBalance < transaction.amount) {
      return res.status(400).json({ 
        success: false, 
        message: "Approval failed: User no longer has sufficient balance." 
      });
    }
    
    user.walletBalance -= transaction.amount;
    await user.save();
  }

  transaction.status = status;
  if (notes) transaction.description += ` - Admin Note: ${notes}`;
  await transaction.save();

  res.json({
    success: true,
    message: `Withdrawal request ${status.toLowerCase()} successfully`,
    data: transaction
  });
});

module.exports = {
  initializeDeposit,
  verifyDeposit,
  instantDeposit,
  getUserTransactions,
  getAllTransactions,
  getFinancialSummary,
  handleWebhook,
  requestWithdrawal,
  processWithdrawal,
};
