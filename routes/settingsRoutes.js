const express = require("express");
const router = express.Router();
const {
  getSettings,
  createSettings,
  updateSettings,
  deleteSettings,
} = require("../controllers/settingsController");

// Example middleware for authentication (if you have one)
// const { protect } = require("../middleware/authMiddleware");

// @route   GET /api/settings
// @desc    Get current settings
// @access  Private
router.get("/", /*protect,*/ getSettings);

// @route   POST /api/settings
// @desc    Create new settings
// @access  Private
router.post("/", /*protect,*/ createSettings);

// @route   PATCH /api/settings
// @desc    Update settings
// @access  Private
router.patch("/", /*protect,*/ updateSettings);

// @route   DELETE /api/settings
// @desc    Delete settings
// @access  Private
router.delete("/", /*protect,*/ deleteSettings);

module.exports = router;
