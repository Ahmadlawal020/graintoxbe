const express = require("express");
const router = express.Router();
const {
  handleLogin,
  handleLogout,
  handleRefreshToken,
  checkEmail,
  register,
  verifyOTP,
} = require("../controllers/authController");

// POST /auth/login
router.post("/login", handleLogin);

// POST /auth/check-email
router.post("/check-email", checkEmail);

// POST /auth/register
router.post("/register", register);

// POST /auth/verify-otp
router.post("/verify-otp", verifyOTP);

// GET /auth/refresh
router.get("/refresh", handleRefreshToken);

// POST /auth/logout
router.post("/logout", handleLogout);

module.exports = router;
