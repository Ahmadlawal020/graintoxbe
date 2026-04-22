const express = require("express");
const router = express.Router();
const verifyJWT = require("../middleware/verifyJWT");
const { getCrops, getCropById, createCrop, updateCrop, deleteCrop, getPriceHistory } = require("../controllers/cropController");

router.use(verifyJWT);

router.route("/")
  .get(getCrops)
  .post(createCrop);

router.route("/:id")
  .get(getCropById)
  .put(updateCrop)
router.get("/:id/history", getPriceHistory);

module.exports = router;
