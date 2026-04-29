const express = require("express");
const router = express.Router();
const {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  getAllManagers,
  getAllPlatformUsers,
  getDepartments,
  updateKycStatus,
  submitKyc,
  getKycSubmissions,
} = require("../controllers/userController");

const verifyJWT = require("../middleware/verifyJWT");

const { checkRole } = require("../middleware/roleMiddleware");

router.use(verifyJWT);

// Role-specific endpoints
router.get("/managers", getAllManagers);
router.get("/platform", getAllPlatformUsers);
router.get("/departments", getDepartments);

// KYC management
router.get("/kyc", getKycSubmissions);
router.patch("/kyc/:id", updateKycStatus);
router.post("/kyc/submit/:id", submitKyc);

// Main route for CRUD on users
router
  .route("/")
  .get(checkRole(["Admin"]), getAllUsers)
  .post(checkRole(["Admin"]), createUser)
  .patch(updateUser)
  .delete(checkRole(["Admin"]), deleteUser);

// GET /api/users/:id → get single user
router.route("/:id").get(getUserById);

module.exports = router;
