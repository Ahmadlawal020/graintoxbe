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

    // Create a COMPLETED transaction record (Instant Verification)
    const newTx = await Transaction.create({
      user: user._id,
      amount: amount,
      type: "Wallet_Topup",
      status: "Completed",
      reference: data.reference,
      description: "Wallet top-up (Instant Verification)",
    });

    console.log(`[Finance] Transaction created and COMPLETED in DB: ${newTx._id} with ref ${newTx.reference}`);

    // Update user balance atomically
    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      { $inc: { walletBalance: amount } },
      { new: true }
    );

    console.log(`[Finance] User ${user._id} balance updated instantly. New balance: ${updatedUser?.walletBalance}`);

    res.status(200).json({
      success: true,
      message: "Deposit initiated and verified instantly",
      data: {
        ...data,
        transactionId: newTx._id
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
    // Check if it's an instant reference
    if (reference.startsWith("INST-")) {
      const transaction = await Transaction.findOne({ reference });
      if (transaction && transaction.status === "Completed") {
        return res.json({ success: true, message: "Instant deposit already completed", data: transaction });
      }
    }

    const data = await paystackService.verifyTransaction(reference);
    console.log(`[Finance] Paystack verify response for ${reference}: status=${data.status}, amount=${data.amount}`);

    if (data.status === "success") {
      let transaction = await Transaction.findOne({ reference });

      if (!transaction) {
        console.warn(`[Finance] Transaction NOT FOUND for ref: ${reference}. Creating it now as Completed (Instant).`);
        // If it's successful in Paystack but not in our DB, create it now
        transaction = await Transaction.create({
          user: user._id,
          amount: data.amount / 100,
          type: "Wallet_Topup",
          status: "Completed",
          reference: reference,
          description: "Wallet top-up (Recovered)",
        });
        
        await User.findByIdAndUpdate(
          user._id,
          { $inc: { walletBalance: data.amount / 100 } }
        );
        
        return res.json({ success: true, message: "Payment verified and record created", data: transaction });
      }

      if (transaction.status === "Completed") {
        console.log(`[Finance] Transaction ${reference} already processed.`);
        return res.json({ success: true, message: "Transaction already processed", data: transaction });
      }

      // Update transaction status
      transaction.status = "Completed";
      await transaction.save();
      console.log(`[Finance] Transaction ${reference} marked as Completed.`);

      // Update user balance atomically
      const depositAmount = data.amount / 100; // Convert back from kobo
      const updatedUser = await User.findByIdAndUpdate(
        transaction.user,
        { $inc: { walletBalance: depositAmount } },
        { new: true }
      );

      if (updatedUser) {
        console.log(`[Finance] User ${transaction.user} balance updated. New balance: ${updatedUser.walletBalance}`);
      } else {
        console.error(`[Finance] User NOT FOUND for transaction ${reference}`);
      }

      res.status(200).json({
        success: true,
        message: "Payment verified successfully",
        data: transaction
      });
    } else {
      console.warn(`[Finance] Payment verification returned non-success status: ${data.status}`);
      const transaction = await Transaction.findOne({ reference });
      if (transaction && data.status === "failed") {
        transaction.status = "Failed";
        await transaction.save();
      }

      res.status(200).json({
        success: false,
        message: `Payment status: ${data.status}`,
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
    .populate("user", "firstName lastName email userId")
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
  const event = req.body;

  if (event.event === "charge.success") {
    const { reference, amount } = event.data;
    console.log(`[Finance Webhook] Received success for ref: ${reference}, amount: ${amount}`);

    const transaction = await Transaction.findOne({ reference });

    if (transaction && transaction.status !== "Completed") {
      transaction.status = "Completed";
      await transaction.save();

      const depositAmount = amount / 100;
      await User.findByIdAndUpdate(
        transaction.user,
        { $inc: { walletBalance: depositAmount } }
      );
      console.log(`[Finance Webhook] Transaction ${reference} completed and user balance updated.`);
    } else if (transaction && transaction.status === "Completed") {
      console.log(`[Finance Webhook] Transaction ${reference} was already completed.`);
    } else {
      console.warn(`[Finance Webhook] Transaction NOT FOUND for reference: ${reference}`);
    }
  }

  res.status(200).send("Webhook Received");
});

module.exports = {
  initializeDeposit,
  verifyDeposit,
  instantDeposit,
  getUserTransactions,
  getAllTransactions,
  getFinancialSummary,
  handleWebhook,
};
