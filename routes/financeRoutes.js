const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();
const verifyJWT = require("../middleware/verifyJWT");
const {
  initializeDeposit,
  verifyDeposit,
  getUserTransactions,
  getAllTransactions,
  getFinancialSummary,
  handleWebhook,
  requestWithdrawal,
  processWithdrawal,
  transferTradingFunds,
} = require("../controllers/financeController");
const { executeTrade, getUserTrades, getAllTrades } = require("../controllers/tradeController");

const { checkRole } = require("../middleware/roleMiddleware");

const tradeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.TRADE_LIMIT_MAX, 10) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many trade attempts. Please wait a moment and try again.",
  },
});

// Public route for webhook
router.post("/webhook", handleWebhook);

router.use(verifyJWT);

// User routes
router.post("/deposit/initialize", initializeDeposit);

router.post("/trading/transfer", transferTradingFunds);
router.post("/trade", tradeLimiter, executeTrade);
router.get("/trades", getUserTrades);
router.get("/deposit/verify/:reference", verifyDeposit);
router.post("/withdrawal/request", requestWithdrawal);
router.get("/transactions", getUserTransactions);

// Admin routes
router.get("/admin/transactions", checkRole(["Admin"]), getAllTransactions);
router.get("/admin/trades", checkRole(["Admin"]), getAllTrades);
router.get("/admin/summary", checkRole(["Admin"]), getFinancialSummary);
router.post("/admin/withdrawal/process", checkRole(["Admin"]), processWithdrawal);

module.exports = router;
