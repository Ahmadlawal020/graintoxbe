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
} = require("../controllers/financeController");
const { executeTrade, getUserTrades, getAllTrades } = require("../controllers/tradeController");

// Admin check middleware
const isAdmin = (req, res, next) => {
  if (req.roles && req.roles.includes("Admin")) {
    next();
  } else {
    res.status(403).json({ message: "Require Admin Role" });
  }
};

// Public route for webhook
router.post("/webhook", handleWebhook);

router.use(verifyJWT);

// User routes
router.post("/deposit/initialize", initializeDeposit);
router.post("/deposit/instant", instantDeposit);
router.post("/trade", executeTrade);
router.get("/trades", getUserTrades);
router.get("/deposit/verify/:reference", verifyDeposit);
router.get("/transactions", getUserTransactions);

// Admin routes
router.get("/admin/transactions", verifyJWT, isAdmin, getAllTransactions);
router.get("/admin/trades", verifyJWT, isAdmin, getAllTrades);
router.get("/admin/summary", verifyJWT, isAdmin, getFinancialSummary);

module.exports = router;
