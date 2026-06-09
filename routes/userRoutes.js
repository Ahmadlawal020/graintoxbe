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
  cancelKyc,
  getKycSubmissions,
  changePassword,
} = require("../controllers/userController");

const verifyJWT = require("../middleware/verifyJWT");

const { checkRole } = require("../middleware/roleMiddleware");

router.use(verifyJWT);

// Role-specific endpoints
router.get("/managers", checkRole(["Admin"]), getAllManagers);
router.get("/platform", checkRole(["Admin", "Warehouse_Manager"]), getAllPlatformUsers);
router.get("/departments", checkRole(["Admin"]), getDepartments);

// KYC management
router.get("/kyc", checkRole(["Admin"]), getKycSubmissions);
router.patch("/kyc/:id", checkRole(["Admin"]), updateKycStatus);
router.post("/kyc/submit/:id", submitKyc);
router.post("/kyc/cancel/:id", cancelKyc);
router.post("/change-password", changePassword);

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
