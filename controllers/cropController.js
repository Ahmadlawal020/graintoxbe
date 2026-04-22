const Crop = require("../models/cropSchema");
const PriceHistory = require("../models/priceHistorySchema");
const asyncHandler = require("express-async-handler");

// @desc    Get all crops
// @route   GET /api/crops
// @access  Private
const getCrops = asyncHandler(async (req, res) => {
  const crops = await Crop.find({});
  res.json(crops);
});

// @desc    Get crop by id
// @route   GET /api/crops/:id
// @access  Private
const getCropById = asyncHandler(async (req, res) => {
  const crop = await Crop.findById(req.params.id);
  if (crop) {
    res.json(crop);
  } else {
    res.status(404).json({ message: "Crop not found" });
  }
});

// @desc    Create crop
// @route   POST /api/crops
// @access  Private
const createCrop = asyncHandler(async (req, res) => {
  const { name, code, category, pricePerUnit, tokenSymbol, quality } = req.body;

  if (!name || !code || !category || !pricePerUnit || !tokenSymbol) {
    return res.status(400).json({ message: "Please provide all required fields" });
  }

  const existing = await Crop.findOne({ code });
  if (existing) {
    return res.status(400).json({ message: "Crop code already exists" });
  }

  const crop = await Crop.create(req.body);

  // Record initial price history
  await PriceHistory.create({
    crop: crop._id,
    symbol: crop.tokenSymbol,
    price: crop.pricePerUnit,
    open: crop.pricePerUnit,
    high: crop.pricePerUnit,
    low: crop.pricePerUnit,
    close: crop.pricePerUnit,
    volume: 0
  });

  res.status(201).json(crop);
});

// @desc    Update crop
// @route   PUT /api/crops/:id
// @access  Private
const updateCrop = asyncHandler(async (req, res) => {
  const crop = await Crop.findById(req.params.id);

  if (!crop) {
    return res.status(404).json({ message: "Crop not found" });
  }

  const oldPrice = crop.pricePerUnit;
  const updatedCrop = await Crop.findByIdAndUpdate(req.params.id, req.body, { new: true });

  // If price changed, record in history
  if (req.body.pricePerUnit && parseFloat(req.body.pricePerUnit) !== oldPrice) {
    await PriceHistory.create({
      crop: updatedCrop._id,
      symbol: updatedCrop.tokenSymbol,
      price: updatedCrop.pricePerUnit,
      open: oldPrice,
      high: Math.max(oldPrice, updatedCrop.pricePerUnit),
      low: Math.min(oldPrice, updatedCrop.pricePerUnit),
      close: updatedCrop.pricePerUnit,
      volume: 0
    });
  }

  res.json(updatedCrop);
});

// @desc    Delete crop
// @route   DELETE /api/crops/:id
// @access  Private
const deleteCrop = asyncHandler(async (req, res) => {
  const crop = await Crop.findById(req.params.id);

  if (!crop) {
    return res.status(404).json({ message: "Crop not found" });
  }

  await crop.deleteOne();
  res.json({ message: "Crop removed" });
});

// @desc    Get price history
// @route   GET /api/crops/:id/history
// @access  Private
const getPriceHistory = asyncHandler(async (req, res) => {
  const history = await PriceHistory.find({ crop: req.params.id })
    .sort({ createdAt: 1 })
    .limit(100);
  res.json(history);
});

module.exports = {
  getCrops,
  getCropById,
  createCrop,
  updateCrop,
  deleteCrop,
  getPriceHistory
};
