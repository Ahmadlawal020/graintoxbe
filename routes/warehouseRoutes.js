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

router.use(verifyJWT);

router.route("/")
  .get(getWarehouses)
  .post(createWarehouse);

router.route("/my").get(getMyWarehouse);

router.route("/:id")
  .get(getWarehouseById)
  .put(updateWarehouse)
  .delete(deleteWarehouse);

module.exports = router;
