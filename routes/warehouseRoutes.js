const express = require("express");
const router = express.Router();
const verifyJWT = require("../middleware/verifyJWT");
const {
  getWarehouses,
  getWarehouseById,
  getMyWarehouse,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
} = require("../controllers/warehouseController");

const { checkRole } = require("../middleware/roleMiddleware");

router.use(verifyJWT);

router.route("/")
  .get(getWarehouses)
  .post(checkRole(["Admin"]), createWarehouse);

router.route("/my").get(checkRole(["Warehouse_Manager", "Admin"]), getMyWarehouse);

router.route("/:id")
  .get(getWarehouseById)
  .put(checkRole(["Admin"]), updateWarehouse)
  .delete(checkRole(["Admin"]), deleteWarehouse);

module.exports = router;
