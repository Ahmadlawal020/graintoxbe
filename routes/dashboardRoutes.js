const express = require("express");
const router = express.Router();
const { getAdminStats } = require("../controllers/dashboardController");
const verifyJWT = require("../middleware/verifyJWT");
const { checkRole } = require("../middleware/roleMiddleware");

router.use(verifyJWT);

router.get("/stats", checkRole(["Admin"]), getAdminStats);

module.exports = router;
