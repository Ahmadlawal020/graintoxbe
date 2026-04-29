const express = require("express");
const router = express.Router();
const {
  getSettings,
  createSettings,
  updateSettings,
  deleteSettings,
} = require("../controllers/settingsController");

const verifyJWT = require("../middleware/verifyJWT");
const { checkRole } = require("../middleware/roleMiddleware");

router.use(verifyJWT);
router.use(checkRole(["Admin"]));

// @route   GET /api/settings
// @desc    Get current settings
// @access  Private
router.get("/", getSettings);

// @route   POST /api/settings
// @desc    Create new settings
// @access  Private
router.post("/", createSettings);

// @route   PATCH /api/settings
// @desc    Update settings
// @access  Private
router.patch("/", updateSettings);

// @route   DELETE /api/settings
// @desc    Delete settings
// @access  Private
router.delete("/", deleteSettings);

module.exports = router;
