const express = require("express");
const router = express.Router();
const { getAdminStats } = require("../controllers/dashboardController");
const verifyJWT = require("../middleware/verifyJWT");

router.use(verifyJWT);

router.get("/stats", getAdminStats);

module.exports = router;
