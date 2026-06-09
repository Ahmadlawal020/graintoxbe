const Storage = require("../models/storageSchema");
const Warehouse = require("../models/warehouseSchema");
const User = require("../models/userSchema");
const Crop = require("../models/cropSchema");
const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");

const isAdmin = (req) => req.roles?.includes("Admin");
const isManager = (req) => req.roles?.includes("Warehouse_Manager");

const getManagedWarehouseIds = async (req) => {
  const warehouses = await Warehouse.find({ managerId: req.user._id }).select("_id").lean();
  return warehouses.map((warehouse) => warehouse._id.toString());
};

const pickAllowedFields = (source, fields) => {
  const picked = {};
  fields.forEach((field) => {
    if (source[field] !== undefined) {
      picked[field] = source[field];
    }
  });
  return picked;
};

const toPositiveQuantity = (value) => {
  const quantity = Number(value);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : null;
};

const getStorageBalanceQuery = (userId, commodity, warehouse) => {
  const match = {
    user: userId.toString(),
    qcStatus: "PASSED",
    $or: [
      { type: "DEPOSIT", status: "DEPOSITED" },
      { type: "TRANSFER", status: "DEPOSITED" },
    ],
  };

  if (commodity) match.commodity = new mongoose.Types.ObjectId(commodity);
  if (warehouse) match.warehouse = new mongoose.Types.ObjectId(warehouse);

  return match;
};

const getStoredBalances = async (userId, options = {}, session) => {
  const pipeline = [
    { $match: getStorageBalanceQuery(userId, options.commodity, options.warehouse) },
    {
      $group: {
        _id: {
          commodity: "$commodity",
          warehouse: "$warehouse",
        },
        quantity: {
          $sum: {
            $switch: {
              branches: [
                { case: { $eq: ["$type", "DEPOSIT"] }, then: "$quantity" },
                { case: { $eq: ["$transferDirection", "TRADING_TO_STORAGE"] }, then: "$quantity" },
                { case: { $eq: ["$transferDirection", "STORAGE_TO_TRADING"] }, then: { $multiply: ["$quantity", -1] } },
              ],
              default: 0,
            },
          },
        },
      },
    },
    { $match: { quantity: { $gt: 0 } } },
    {
      $lookup: {
        from: "crops",
        localField: "_id.commodity",
        foreignField: "_id",
        as: "commodity",
      },
    },
    {
      $lookup: {
        from: "warehouses",
        localField: "_id.warehouse",
        foreignField: "_id",
        as: "warehouse",
      },
    },
    {
      $project: {
        _id: 0,
        commodity: { $first: "$commodity" },
        warehouse: { $first: "$warehouse" },
        quantity: 1,
      },
    },
  ];

  const aggregate = Storage.aggregate(pipeline);
  if (session) aggregate.session(session);
  return aggregate;
};

const generateTransferReceipt = () => `TR-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

// @desc    Get all storage operations
// @route   GET /api/storage
// @access  Private
const getStorageOperations = asyncHandler(async (req, res) => {
  const { roles, user } = req;

  let query = {};

  // If user is a regular user (not admin or manager), show only their operations
  if (roles.includes("Admin")) {
    query = {};
  } else if (roles.includes("Warehouse_Manager")) {
    const warehouseIds = await getManagedWarehouseIds(req);
    query.warehouse = { $in: warehouseIds };
  } else {
    query.user = user._id;
  }

  const operations = await Storage.find(query)
    .populate("commodity", "name code")
    .populate("warehouse", "name location")
    .populate("agent", "firstName lastName")
    .sort({ timestamp: -1 });

  res.json(operations);
});

// @desc    Create storage operation
// @route   POST /api/storage
// @access  Private
const createStorageOperation = asyncHandler(async (req, res) => {
  const { type, commodity, quantity, warehouse, agent, receiptNo } = req.body;
  const quantityValue = Number(quantity);

  if (!type || !commodity || !quantity || !warehouse || !receiptNo) {
    return res.status(400).json({ message: "Please provide all required fields" });
  }

  if (!Number.isFinite(quantityValue) || quantityValue <= 0) {
    return res.status(400).json({ message: "Quantity must be greater than zero" });
  }

  if (!["DEPOSIT", "WITHDRAWAL", "TRANSFER"].includes(type)) {
    return res.status(400).json({ message: "Invalid storage operation type" });
  }

  if (!isAdmin(req) && !isManager(req) && type === "TRANSFER") {
    return res.status(403).json({ message: "Only admins or warehouse managers can create transfer operations" });
  }

  if (isManager(req)) {
    const warehouseIds = await getManagedWarehouseIds(req);
    if (!warehouseIds.includes(warehouse.toString())) {
      return res.status(403).json({ message: "Forbidden: You can only create operations for your assigned warehouse." });
    }
  }

  const warehouseRecord = await Warehouse.findById(warehouse);
  if (!warehouseRecord) {
    return res.status(404).json({ message: "Warehouse not found" });
  }

  // Check if warehouse has capacity for operational deposits
  if (type === "DEPOSIT") {
    if (warehouseRecord.availableCapacity < quantityValue) {
      return res.status(400).json({ message: "Insufficient warehouse capacity" });
    }
    if (isAdmin(req) || isManager(req)) {
      await Warehouse.findByIdAndUpdate(warehouse, { $inc: { availableCapacity: -quantityValue } });
    }
  }

  // Update available capacity for operational withdrawals
  if (type === "WITHDRAWAL" && (isAdmin(req) || isManager(req))) {
    await Warehouse.findByIdAndUpdate(warehouse, { $inc: { availableCapacity: quantityValue } });
  }

  // Regular users can only create pending operations for themselves.
  const operationData = {
    type,
    commodity,
    quantity: quantityValue,
    warehouse,
    agent: isAdmin(req) || isManager(req) ? (agent || req.user._id) : undefined,
    receiptNo,
    user: isAdmin(req) || isManager(req) ? (req.body.user || req.user._id) : req.user._id,
    unit: req.body.unit || "kg",
    deliveryMethod: req.body.deliveryMethod,
    notes: req.body.notes,
    status: isAdmin(req) || isManager(req) ? (req.body.status || "PENDING") : "PENDING",
    qcStatus: isAdmin(req) || isManager(req) ? (req.body.qcStatus || "PENDING") : "PENDING",
  };

  const operation = await Storage.create(operationData);
  res.status(201).json(operation);
});

// @desc    Update storage operation (e.g., QC status)
// @route   PUT /api/storage/:id
// @access  Private
const updateStorageOperation = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const operation = await Storage.findById(id);
  if (!operation) {
    return res.status(404).json({ message: "Storage operation not found" });
  }

  if (isManager(req)) {
    const warehouseIds = await getManagedWarehouseIds(req);
    if (!warehouseIds.includes(operation.warehouse.toString())) {
      return res.status(403).json({ message: "Forbidden: You can only update operations for your assigned warehouse." });
    }
  }

  const updates = pickAllowedFields(req.body, [
    "status",
    "qcStatus",
    "moisture",
    "foreignMatter",
    "pestDamage",
    "qcRemarks",
    "notes",
    "agent",
    "deliveryMethod",
  ]);

  if (!Object.keys(updates).length) {
    return res.status(400).json({ message: "No allowed fields provided for update" });
  }

  const updatedOperation = await Storage.findByIdAndUpdate(
    id,
    { $set: updates },
    { new: true, runValidators: true }
  );

  res.json(updatedOperation);
});

// @desc    Get user's available stored crop balances
// @route   GET /api/storage/balances
// @access  Private
const getStorageBalances = asyncHandler(async (req, res) => {
  const balances = await getStoredBalances(req.user._id);
  res.json(balances);
});

// @desc    Move crops between warehouse storage and trading holdings
// @route   POST /api/storage/trading-transfer
// @access  Private
const transferTradingCrops = asyncHandler(async (req, res) => {
  const { direction, commodity, warehouse, quantity } = req.body;
  const transferQuantity = toPositiveQuantity(quantity);

  if (!["storage_to_trading", "trading_to_storage"].includes(direction) || !commodity || !warehouse || !transferQuantity) {
    return res.status(400).json({ success: false, message: "Invalid crop transfer request" });
  }

  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(async () => {
      const user = await User.findById(req.user._id).session(session);
      const crop = mongoose.Types.ObjectId.isValid(commodity)
        ? await Crop.findById(commodity).session(session)
        : await Crop.findOne({ tokenSymbol: commodity.toString().toUpperCase() }).session(session);

      if (!user) {
        const error = new Error("User not found");
        error.statusCode = 404;
        throw error;
      }

      if (!crop) {
        const error = new Error("Crop not found");
        error.statusCode = 404;
        throw error;
      }

      const targetWarehouse = await Warehouse.findById(warehouse).session(session);

      if (!targetWarehouse) {
        const error = new Error("Warehouse not found");
        error.statusCode = 404;
        throw error;
      }

      const holdingIndex = user.holdings.findIndex((holding) => holding.tokenSymbol === crop.tokenSymbol);

      if (direction === "storage_to_trading") {
        const balances = await getStoredBalances(req.user._id, { commodity, warehouse }, session);
        const availableStored = balances.reduce((sum, balance) => sum + balance.quantity, 0);

        if (availableStored < transferQuantity) {
          const error = new Error("Insufficient stored crop balance");
          error.statusCode = 400;
          throw error;
        }

        if (holdingIndex > -1) {
          user.holdings[holdingIndex].amount += transferQuantity;
        } else {
          user.holdings.push({
            crop: crop._id,
            tokenSymbol: crop.tokenSymbol,
            amount: transferQuantity,
            averagePrice: crop.pricePerUnit,
          });
        }
      } else {
        if (holdingIndex === -1 || user.holdings[holdingIndex].amount < transferQuantity) {
          const error = new Error("Insufficient trading crop balance");
          error.statusCode = 400;
          throw error;
        }

        user.holdings[holdingIndex].amount -= transferQuantity;
        if (user.holdings[holdingIndex].amount <= 0) {
          user.holdings.splice(holdingIndex, 1);
        }
      }

      await user.save({ session });

      const [operation] = await Storage.create([{
        type: "TRANSFER",
        transferDirection: direction === "storage_to_trading" ? "STORAGE_TO_TRADING" : "TRADING_TO_STORAGE",
        commodity: crop._id,
        quantity: transferQuantity,
        unit: crop.unit || "kg",
        warehouse,
        user: req.user._id,
        agent: req.user._id,
        status: "DEPOSITED",
        qcStatus: "PASSED",
        receiptNo: generateTransferReceipt(),
        notes: direction === "storage_to_trading"
          ? `Moved ${transferQuantity} ${crop.unit || "kg"} ${crop.name} from storage to trading`
          : `Moved ${transferQuantity} ${crop.unit || "kg"} ${crop.name} from trading to storage`,
      }], { session });

      result = {
        operation,
        holdings: user.holdings,
      };
    });

    res.json({
      success: true,
      message: "Crop transfer completed successfully",
      ...result,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : "Crop transfer could not be completed",
    });
  } finally {
    await session.endSession();
  }
});

module.exports = {
  getStorageOperations,
  createStorageOperation,
  updateStorageOperation,
  getStorageBalances,
  transferTradingCrops,
};
