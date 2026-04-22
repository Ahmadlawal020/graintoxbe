const Storage = require("../models/storageSchema");
const Warehouse = require("../models/warehouseSchema");
const asyncHandler = require("express-async-handler");

// @desc    Get all storage operations
// @route   GET /api/storage
// @access  Private
const getStorageOperations = asyncHandler(async (req, res) => {
  const { roles, user } = req;
  
  let query = {};
  
  // If user is a regular user (not admin or manager), show only their operations
  const isAdmin = roles.includes("Admin");
  const isManager = roles.includes("Warehouse_Manager");
  
  if (!isAdmin && !isManager) {
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

  if (!type || !commodity || !quantity || !warehouse || !receiptNo) {
    return res.status(400).json({ message: "Please provide all required fields" });
  }

  // Check if warehouse has capacity for deposits
  if (type === "DEPOSIT") {
    const wh = await Warehouse.findById(warehouse);
    if (wh && wh.availableCapacity < quantity) {
        return res.status(400).json({ message: "Insufficient warehouse capacity" });
    }
    // Update available capacity
    await Warehouse.findByIdAndUpdate(warehouse, { $inc: { availableCapacity: -quantity } });
  }

  // Update available capacity for withdrawals
  if (type === "WITHDRAWAL") {
    await Warehouse.findByIdAndUpdate(warehouse, { $inc: { availableCapacity: quantity } });
  }

  // Ensure the operation is assigned to the current user
  const operationData = {
    ...req.body,
    user: req.user._id
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

  const updatedOperation = await Storage.findByIdAndUpdate(
    id,
    { $set: req.body },
    { new: true, runValidators: true }
  );

  res.json(updatedOperation);
});

module.exports = {
  getStorageOperations,
  createStorageOperation,
  updateStorageOperation,
};
