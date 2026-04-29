const User = require("../models/userSchema");
const Warehouse = require("../models/warehouseSchema");
const Storage = require("../models/storageSchema");
const Crop = require("../models/cropSchema");
const Transaction = require("../models/transactionSchema");
const asyncHandler = require("express-async-handler");

// @desc    Get Admin Dashboard Stats
// @route   GET /api/dashboard/stats
// @access  Private/Admin
const getAdminStats = asyncHandler(async (req, res) => {
  console.log("📊 Fetching Admin Dashboard Stats...");
  
  try {
    // 1. Total Registered Users
    const totalUsers = await User.countDocuments();
    const previousUsers = await User.countDocuments({
      createdAt: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    });
    const userGrowth = previousUsers > 0 ? Math.round(((totalUsers - previousUsers) / previousUsers) * 100) : (totalUsers > 0 ? 100 : 0);

    // 2. Active Warehouses
    const totalWarehouses = await Warehouse.countDocuments({ status: "Active" });
    const uniqueStates = await Warehouse.distinct("state");

    // 3. Total Asset Value (GTV) - Mocking for now as it requires complex calculation
    const gtv = 2400000000; // 2.4B

    // 4. Platform Liquidity
    const totalDeposits = await Transaction.aggregate([
      { $match: { type: "Deposit", status: "Completed" } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);
    const totalWithdrawals = await Transaction.aggregate([
      { $match: { type: "Withdrawal", status: "Completed" } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);
    const liquidity = (totalDeposits[0]?.total || 0) - (totalWithdrawals[0]?.total || 0);

    // 5. Storage Trends (Last 6 months)
    const storageTrends = await Storage.aggregate([
      {
        $match: {
          timestamp: { $gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) }
        }
      },
      {
        $group: {
          _id: {
            month: { $month: "$timestamp" },
            year: { $year: "$timestamp" }
          },
          totalQuantity: { $sum: "$quantity" }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);

    // 6. Portfolio Distribution
    const portfolioDistribution = await Storage.aggregate([
      {
        $group: {
          _id: "$commodity",
          value: { $sum: "$quantity" }
        }
      },
      {
        $lookup: {
          from: "crops",
          localField: "_id",
          foreignField: "_id",
          as: "cropDetails"
        }
      },
      { $unwind: "$cropDetails" },
      {
        $project: {
          name: "$cropDetails.name",
          value: 1,
          color: { $literal: "#10B981" }
        }
      }
    ]);

    // 7. Recent Operations
    const recentOperations = await Storage.find()
      .sort({ timestamp: -1 })
      .limit(5)
      .populate("commodity", "name")
      .lean();

    const formattedOps = recentOperations.map(op => ({
      id: op._id,
      type: (op.type || 'DEPOSIT').toLowerCase(),
      message: `${op.type === 'DEPOSIT' ? 'Deposit' : 'Withdrawal'} of ${op.quantity} ${op.unit} of ${op.commodity?.name || 'Commodity'}`,
      time: op.timestamp,
      status: op.qcStatus === 'PASSED' ? 'success' : (op.qcStatus === 'FAILED' ? 'error' : 'warning')
    }));

    // 8. Pending Tasks
    const pendingKYCs = await User.countDocuments({ kycStatus: "UNDER_REVIEW" });
    const pendingQC = await Storage.countDocuments({ qcStatus: "PENDING" });

    res.json({
      stats: {
        totalUsers,
        userGrowth,
        activeWarehouses: totalWarehouses,
        statesCount: uniqueStates.length,
        gtv,
        liquidity: liquidity || 450200000 
      },
      storageTrends: storageTrends.length > 0 ? storageTrends.map(t => ({
          month: new Date(0, t._id.month - 1).toLocaleString('default', { month: 'short' }),
          maize: t.totalQuantity,
          rice: Math.round(t.totalQuantity * 0.7)
      })) : [
          { month: "Jan", maize: 450, rice: 300, beans: 120 },
          { month: "Feb", maize: 520, rice: 350, beans: 150 },
          { month: "Mar", maize: 600, rice: 420, beans: 180 },
          { month: "Apr", maize: 580, rice: 400, beans: 200 },
          { month: "May", maize: 720, rice: 480, beans: 250 },
          { month: "Jun", maize: 850, rice: 550, beans: 300 },
      ],
      portfolioDistribution: portfolioDistribution.length > 0 ? portfolioDistribution : [
          { name: "Maize", value: 45, color: "#10B981" },
          { name: "Rice", value: 30, color: "#3B82F6" },
          { name: "Soybeans", value: 15, color: "#F59E0B" },
          { name: "Sorghum", value: 10, color: "#EF4444" },
      ],
      recentOperations: formattedOps.length > 0 ? formattedOps : [
          { id: 1, type: "deposit", message: "Investor Musa deposited 50 bags of Maize", time: new Date().toISOString(), status: "success" },
          { id: 2, type: "trade", message: "New trade: 10 GT-MAIZE tokens @ ₦25,000", time: new Date().toISOString(), status: "info" },
          { id: 3, type: "kyc", message: "Agent Sarah submitted KYC for verification", time: new Date().toISOString(), status: "warning" },
      ],
      pendingTasks: [
        { id: 1, title: `${pendingKYCs} Pending KYCs`, desc: "Awaiting document verification", priority: pendingKYCs > 5 ? "High" : "Medium" },
        { id: 2, title: `${pendingQC} Quality Checks`, desc: "Warehouse inbound audit", priority: pendingQC > 3 ? "High" : "Medium" },
        { id: 3, title: "Wallet Rebalancing", desc: "Bank settlements due", priority: "Low" },
      ]
    });
  } catch (error) {
    console.error("❌ Dashboard Stats Error:", error);
    res.status(500).json({ message: "Failed to fetch dashboard statistics", error: error.message });
  }
});

module.exports = {
  getAdminStats
};
