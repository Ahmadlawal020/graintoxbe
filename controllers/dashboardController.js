const User = require("../models/userSchema");
const Warehouse = require("../models/warehouseSchema");
const Storage = require("../models/storageSchema");
const Crop = require("../models/cropSchema");
const Trade = require("../models/tradeSchema");
const Transaction = require("../models/transactionSchema");
const asyncHandler = require("express-async-handler");

// @desc    Get Admin Dashboard Stats
// @route   GET /api/dashboard/stats
// @access  Private/Admin
const getAdminStats = asyncHandler(async (req, res) => {
  console.log("📊 Fetching Admin Dashboard Stats...");
  
  try {
    // ── 1. Total Registered Users ──────────────────────────────
    const totalUsers = await User.countDocuments();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const previousUsers = await User.countDocuments({
      createdAt: { $lt: thirtyDaysAgo }
    });
    const userGrowth = previousUsers > 0
      ? Math.round(((totalUsers - previousUsers) / previousUsers) * 100)
      : (totalUsers > 0 ? 100 : 0);

    // ── 2. Active Warehouses ───────────────────────────────────
    const totalWarehouses = await Warehouse.countDocuments({ status: "Active" });
    const uniqueStates = await Warehouse.distinct("state");

    // ── 3. Total Asset Value (GTV) ─────────────────────────────
    // Sum of all user wallet balances + portfolio values
    const gtvAgg = await User.aggregate([
      {
        $group: {
          _id: null,
          totalWallets: { $sum: "$walletBalance" },
          totalPortfolios: { $sum: "$portfolioValue" }
        }
      }
    ]);
    const gtv = gtvAgg.length > 0
      ? (gtvAgg[0].totalWallets || 0) + (gtvAgg[0].totalPortfolios || 0)
      : 0;

    // GTV from previous week for trend calculation
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentTradeVolume = await Trade.aggregate([
      { $match: { status: "Completed", createdAt: { $gte: sevenDaysAgo } } },
      { $group: { _id: null, total: { $sum: "$total" } } }
    ]);
    const weeklyTradeVolume = recentTradeVolume[0]?.total || 0;

    // ── 4. Platform Liquidity ──────────────────────────────────
    // Real liquidity = total completed deposits - total completed withdrawals
    const totalDeposits = await Transaction.aggregate([
      { $match: { type: "Deposit", status: "Completed" } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);
    const totalWithdrawals = await Transaction.aggregate([
      { $match: { type: "Withdrawal", status: "Completed" } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);
    const depositsTotal = totalDeposits[0]?.total || 0;
    const withdrawalsTotal = totalWithdrawals[0]?.total || 0;
    const liquidity = depositsTotal - withdrawalsTotal;

    // Liquidity from 7 days ago for trend
    const depositsLastWeek = await Transaction.aggregate([
      { $match: { type: "Deposit", status: "Completed", createdAt: { $lt: sevenDaysAgo } } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);
    const withdrawalsLastWeek = await Transaction.aggregate([
      { $match: { type: "Withdrawal", status: "Completed", createdAt: { $lt: sevenDaysAgo } } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);
    const liquidityLastWeek = (depositsLastWeek[0]?.total || 0) - (withdrawalsLastWeek[0]?.total || 0);
    const liquidityChange = liquidityLastWeek > 0
      ? Math.round(((liquidity - liquidityLastWeek) / liquidityLastWeek) * 100 * 10) / 10
      : (liquidity > 0 ? 100 : 0);

    // ── 5. Storage Trends (Last 6 months) ──────────────────────
    const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
    const storageTrends = await Storage.aggregate([
      {
        $match: {
          timestamp: { $gte: sixMonthsAgo }
        }
      },
      {
        $lookup: {
          from: "crops",
          localField: "commodity",
          foreignField: "_id",
          as: "cropInfo"
        }
      },
      { $unwind: "$cropInfo" },
      {
        $group: {
          _id: {
            month: { $month: "$timestamp" },
            year: { $year: "$timestamp" },
            cropName: "$cropInfo.name"
          },
          totalQuantity: { $sum: "$quantity" }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);

    // Pivot into { month, crop1: qty, crop2: qty, ... } format
    const monthMap = {};
    storageTrends.forEach(t => {
      const monthLabel = new Date(t._id.year, t._id.month - 1).toLocaleString("default", { month: "short" });
      const key = `${t._id.year}-${t._id.month}`;
      if (!monthMap[key]) {
        monthMap[key] = { month: monthLabel };
      }
      monthMap[key][t._id.cropName.toLowerCase()] = t.totalQuantity;
    });
    const formattedTrends = Object.values(monthMap);

    // ── 6. Portfolio Distribution ──────────────────────────────
    const COLORS = ["#10B981", "#3B82F6", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#06B6D4", "#F97316"];
    const portfolioDistribution = await Crop.aggregate([
      {
        $project: {
          name: 1,
          value: "$totalStock"
        }
      },
      { $match: { value: { $gt: 0 } } },
      { $sort: { value: -1 } }
    ]);
    // Assign colors
    portfolioDistribution.forEach((item, idx) => {
      item.color = COLORS[idx % COLORS.length];
      delete item._id;
    });

    // ── 7. Recent Operations ───────────────────────────────────
    const recentOperations = await Storage.find()
      .sort({ timestamp: -1 })
      .limit(5)
      .populate("commodity", "name")
      .populate("warehouse", "name")
      .lean();

    const formattedOps = recentOperations.map(op => ({
      id: op._id,
      type: (op.type || "DEPOSIT").toLowerCase(),
      message: `${op.type === "DEPOSIT" ? "Deposit" : op.type === "WITHDRAWAL" ? "Withdrawal" : "Transfer"} of ${op.quantity} ${op.unit} of ${op.commodity?.name || "Commodity"} at ${op.warehouse?.name || "Warehouse"}`,
      time: op.timestamp,
      status: op.qcStatus === "PASSED" ? "success" : (op.qcStatus === "FAILED" ? "error" : "warning")
    }));

    // Also include recent financial transactions if no storage ops
    let recentFinOps = [];
    if (formattedOps.length < 5) {
      const limit = 5 - formattedOps.length;
      const recentTxns = await Transaction.find()
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate("user", "firstName lastName")
        .lean();

      recentFinOps = recentTxns.map(tx => ({
        id: tx._id,
        type: tx.type.toLowerCase().includes("deposit") ? "deposit" : "withdrawal",
        message: `${tx.type.replace("_", " ")} of ₦${tx.amount?.toLocaleString()} by ${tx.user?.firstName || "User"} ${tx.user?.lastName || ""}`.trim(),
        time: tx.createdAt,
        status: tx.status === "Completed" ? "success" : (tx.status === "Failed" ? "error" : "warning")
      }));
    }

    const allOperations = [...formattedOps, ...recentFinOps].slice(0, 5);

    // ── 8. Pending Tasks ───────────────────────────────────────
    const pendingKYCs = await User.countDocuments({ kycStatus: "UNDER_REVIEW" });
    const pendingQC = await Storage.countDocuments({ qcStatus: "PENDING" });
    const pendingWithdrawals = await Transaction.countDocuments({ type: "Withdrawal", status: "Pending" });

    const pendingTasks = [];
    // Only add tasks that have real counts
    if (pendingKYCs > 0) {
      pendingTasks.push({
        id: 1,
        title: `${pendingKYCs} Pending KYC${pendingKYCs > 1 ? "s" : ""}`,
        desc: "Awaiting document verification",
        priority: pendingKYCs > 5 ? "High" : "Medium"
      });
    }
    if (pendingQC > 0) {
      pendingTasks.push({
        id: 2,
        title: `${pendingQC} Quality Check${pendingQC > 1 ? "s" : ""}`,
        desc: "Warehouse inbound audit",
        priority: pendingQC > 3 ? "High" : "Medium"
      });
    }
    if (pendingWithdrawals > 0) {
      pendingTasks.push({
        id: 3,
        title: `${pendingWithdrawals} Pending Withdrawal${pendingWithdrawals > 1 ? "s" : ""}`,
        desc: "Awaiting admin approval",
        priority: pendingWithdrawals > 5 ? "High" : "Medium"
      });
    }

    res.json({
      stats: {
        totalUsers,
        userGrowth,
        activeWarehouses: totalWarehouses,
        statesCount: uniqueStates.length,
        gtv,
        gtvWeeklyChange: weeklyTradeVolume,
        liquidity,
        liquidityChange,
        totalDeposits: depositsTotal,
        totalWithdrawals: withdrawalsTotal
      },
      storageTrends: formattedTrends,
      portfolioDistribution,
      recentOperations: allOperations,
      pendingTasks
    });
  } catch (error) {
    console.error("❌ Dashboard Stats Error:", error);
    res.status(500).json({ message: "Failed to fetch dashboard statistics", error: error.message });
  }
});

module.exports = {
  getAdminStats
};
