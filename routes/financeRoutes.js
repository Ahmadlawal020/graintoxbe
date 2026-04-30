const express = require("express");
const router = express.Router();
const verifyJWT = require("../middleware/verifyJWT");
const {
  initializeDeposit,
  verifyDeposit,
  instantDeposit,
  getUserTransactions,
  getAllTransactions,
  getFinancialSummary,
  handleWebhook,
  requestWithdrawal,
  processWithdrawal,
} = require("../controllers/financeController");
const { executeTrade, getUserTrades, getAllTrades } = require("../controllers/tradeController");

const { checkRole } = require("../middleware/roleMiddleware");

// Public route for webhook
router.post("/webhook", handleWebhook);

router.use(verifyJWT);

// User routes
router.post("/deposit/initialize", initializeDeposit);
router.post("/deposit/instant", instantDeposit);
router.post("/trade", executeTrade);
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
