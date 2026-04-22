const express = require("express");
const router = express.Router();
const verifyJWT = require("../middleware/verifyJWT");
const { getStorageOperations, createStorageOperation, updateStorageOperation } = require("../controllers/storageController");

router.use(verifyJWT);

router.route("/")
  .get(getStorageOperations)
  .post(createStorageOperation);

router.route("/:id")
  .put(updateStorageOperation);

module.exports = router;
