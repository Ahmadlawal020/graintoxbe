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

// Role-specific protection
const isAdmin = (req, res, next) => {
  if (req.roles && req.roles.includes("Admin")) {
    next();
  } else {
    res.status(403).json({ message: "Require Admin Role" });
  }
};

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
  .get(isAdmin, getAllUsers)
  .post(isAdmin, createUser)
  .patch(updateUser)
  .delete(isAdmin, deleteUser);

// GET /api/users/:id → get single user
router.route("/:id").get(getUserById);

module.exports = router;
