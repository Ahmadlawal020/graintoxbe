const express = require("express");
const router = express.Router();
const verifyJWT = require("../middleware/verifyJWT");
const {
  getStorageOperations,
  createStorageOperation,
  updateStorageOperation,
  getStorageBalances,
  transferTradingCrops,
} = require("../controllers/storageController");
const { checkRole } = require("../middleware/roleMiddleware");

router.use(verifyJWT);

router.route("/")
  .get(getStorageOperations)
  .post(checkRole(["User", "Warehouse_Manager", "Admin"]), createStorageOperation);

router.get("/balances", checkRole(["User", "Warehouse_Manager", "Admin"]), getStorageBalances);
router.post("/trading-transfer", checkRole(["User"]), transferTradingCrops);

router.route("/:id")
  .put(checkRole(["Warehouse_Manager", "Admin"]), updateStorageOperation);

module.exports = router;
