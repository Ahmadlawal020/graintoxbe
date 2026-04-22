const Warehouse = require("../models/warehouseSchema");
const asyncHandler = require("express-async-handler");

// @desc    Get all warehouses
// @route   GET /api/warehouses
// @access  Private
const getWarehouses = asyncHandler(async (req, res) => {
  const warehouses = await Warehouse.find().populate("managerId", "firstName lastName email phone userId");
  res.json(warehouses);
});

// @desc    Get warehouse by ID
// @route   GET /api/warehouses/:id
// @access  Private
const getWarehouseById = asyncHandler(async (req, res) => {
  const warehouse = await Warehouse.findById(req.params.id).populate("managerId", "firstName lastName email phone userId");
  if (!warehouse) {
    return res.status(404).json({ message: "Warehouse not found" });
  }
  res.json(warehouse);
});

// @desc    Get warehouse assigned to current manager
// @route   GET /api/warehouses/my
// @access  Private
const getMyWarehouse = asyncHandler(async (req, res) => {
  const warehouse = await Warehouse.findOne({ managerId: req.user._id }).populate("managerId", "firstName lastName email phone userId");
  if (!warehouse) {
    return res.status(404).json({ message: "No warehouse assigned to this manager" });
  }
  res.json(warehouse);
});

// @desc    Create new warehouse
// @route   POST /api/warehouses
// @access  Private
const createWarehouse = asyncHandler(async (req, res) => {
  const { name, capacity, location, state, ownerName } = req.body;

  if (!name || !capacity || !location || !state || !ownerName) {
    return res.status(400).json({ message: "Please provide required facility and owner details" });
  }

  const warehouse = await Warehouse.create({
    ...req.body,
    availableCapacity: capacity // initialize available capacity
  });

  res.status(201).json(warehouse);
});

// @desc    Update warehouse
// @route   PUT /api/warehouses/:id
// @access  Private
const updateWarehouse = asyncHandler(async (req, res) => {
  const warehouse = await Warehouse.findById(req.params.id);

  if (!warehouse) {
    return res.status(404).json({ message: "Warehouse not found" });
  }

  const updatedWarehouse = await Warehouse.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true }
  ).populate("managerId", "firstName lastName email phone userId");

  res.json(updatedWarehouse);
});

// @desc    Delete warehouse
// @route   DELETE /api/warehouses/:id
// @access  Private
const deleteWarehouse = asyncHandler(async (req, res) => {
  const warehouse = await Warehouse.findById(req.params.id);

  if (!warehouse) {
    return res.status(404).json({ message: "Warehouse not found" });
  }

  await warehouse.deleteOne();
  res.json({ message: "Warehouse removed" });
});

module.exports = {
  getWarehouses,
  getWarehouseById,
  getMyWarehouse,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
};
