const express = require("express");
const router = express.Router();
const verifyJWT = require("../middleware/verifyJWT");
const { getCrops, getCropById, createCrop, updateCrop, deleteCrop, getPriceHistory } = require("../controllers/cropController");
const { checkRole } = require("../middleware/roleMiddleware");

router.use(verifyJWT);

router.route("/")
  .get(getCrops)
  .post(checkRole(["Admin"]), createCrop);

router.route("/:id")
  .get(getCropById)
  .put(checkRole(["Admin"]), updateCrop)
  .delete(checkRole(["Admin"]), deleteCrop);
router.get("/:id/history", getPriceHistory);

module.exports = router;
