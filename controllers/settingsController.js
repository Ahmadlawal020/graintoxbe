const Settings = require("../models/settingsSchema");
const asyncHandler = require("express-async-handler");

const getSettings = asyncHandler(async (req, res) => {
  let settings = await Settings.findOne()
    .populate("updatedBy", "firstName lastName email")
    .lean();

  if (!settings) {
    // Return default settings if none exist
    settings = await Settings.create({});
  }

  res.json(settings);
});

const createSettings = asyncHandler(async (req, res) => {
  const existing = await Settings.findOne().lean().exec();
  if (existing) {
    return res.status(409).json({ message: "Settings already exist. Use update instead." });
  }

  const settingsObject = {
    ...req.body,
    updatedBy: req.user?._id || null,
  };

  const newSettings = await Settings.create(settingsObject);
  res.status(201).json(newSettings);
});

const updateSettings = asyncHandler(async (req, res) => {
  let settings = await Settings.findOne().exec();

  if (!settings) {
    settings = new Settings();
  }

  const { 
    tradingFeePercentage, 
    withdrawalFeePercentage, 
    baseCurrency, 
    kycRequiredForTrade, 
    kycRequiredForDeposit, 
    maintenanceMode 
  } = req.body;

  if (tradingFeePercentage !== undefined) settings.tradingFeePercentage = tradingFeePercentage;
  if (withdrawalFeePercentage !== undefined) settings.withdrawalFeePercentage = withdrawalFeePercentage;
  if (baseCurrency !== undefined) settings.baseCurrency = baseCurrency;
  if (kycRequiredForTrade !== undefined) settings.kycRequiredForTrade = kycRequiredForTrade;
  if (kycRequiredForDeposit !== undefined) settings.kycRequiredForDeposit = kycRequiredForDeposit;
  if (maintenanceMode !== undefined) settings.maintenanceMode = maintenanceMode;

  settings.updatedBy = req.user?._id || settings.updatedBy;

  const updatedSettings = await settings.save();
  res.json(updatedSettings);
});

const deleteSettings = asyncHandler(async (req, res) => {
  const settings = await Settings.findOne().exec();
  if (!settings) {
    return res.status(404).json({ message: "Settings not found." });
  }
  await settings.deleteOne();
  res.json({ message: "Settings deleted successfully." });
});

module.exports = {
  getSettings,
  createSettings,
  updateSettings,
  deleteSettings,
};
