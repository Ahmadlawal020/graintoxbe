const User = require("../models/userSchema");
const bcrypt = require("bcryptjs");
const asyncHandler = require("express-async-handler");

// @desc    Get all users
// @route   GET /api/users
// @access  Private
const getAllUsers = asyncHandler(async (req, res) => {
  const users = await User.find().select("-password").lean();

  if (!users?.length) {
    return res.status(404).json({ message: "No users found." });
  }

  res.json(users);
});

// @desc    Get all warehouse managers
// @route   GET /api/users/managers
// @access  Private
const getAllManagers = asyncHandler(async (req, res) => {
  const users = await User.find({ role: { $in: ["Warehouse_Manager"] } })
    .select("-password")
    .lean();

  if (!users?.length) {
    return res.status(404).json({ message: "No managers found." });
  }

  res.json(users);
});

// @desc    Get all platform users (Investors & Users)
// @route   GET /api/users/platform
// @access  Private
const getAllPlatformUsers = asyncHandler(async (req, res) => {
  const users = await User.find({ role: { $in: ["User"] } })
    .select("-password")
    .lean();

  if (!users?.length) {
    return res.status(404).json({ message: "No platform users found." });
  }

  res.json(users);
});

// @desc    Get all users with KYC submissions
// @route   GET /api/users/kyc
// @access  Private
const getKycSubmissions = asyncHandler(async (req, res) => {
  const users = await User.find({
    $or: [
      { kycStatus: { $in: ["UNDER_REVIEW", "VERIFIED", "REJECTED"] } },
      { kycDocumentUrl: { $exists: true, $ne: "" } }
    ]
  })
    .select("-password")
    .lean();

  if (!users?.length) {
    return res.status(404).json({ message: "No KYC submissions found." });
  }

  res.json(users);
});

// GET /api/departments
const getDepartments = async (req, res) => {
  try {
    const departments = await User.distinct("department", {
      department: { $ne: null },
    });
    res.json(departments);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch departments" });
  }
};

// @desc    Update KYC status
const updateKycStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { kycStatus } = req.body;

  const user = await User.findById(id).exec();
  if (!user) return res.status(404).json({ message: "User not found." });

  user.kycStatus = kycStatus;
  user.updatedAt = new Date();
  const updated = await user.save();

  res.json({
    message: `KYC status for ${updated.firstName} ${updated.lastName} updated to ${kycStatus}.`,
  });
});

// @desc    Submit KYC data
// @route   POST /api/users/kyc/submit/:id
// @access  Private
const submitKyc = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { kycDocType, kycDocumentUrl, kycDocumentBackUrl, kycLivePhotoUrl } = req.body;

  const user = await User.findById(id).exec();
  if (!user) return res.status(404).json({ message: "User not found." });

  user.kycDocType = kycDocType;
  user.kycDocumentUrl = kycDocumentUrl;
  user.kycDocumentBackUrl = kycDocumentBackUrl;
  user.kycLivePhotoUrl = kycLivePhotoUrl;
  user.kycStatus = "UNDER_REVIEW";
  user.kycSubmittedAt = new Date();
  user.updatedAt = new Date();

  await user.save();

  res.json({
    success: true,
    message: "KYC documents submitted successfully and are now under review.",
  });
});

// @desc    Get user by ID
// @route   GET /api/users/:id
// @access  Private
const getUserById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Security: Only allow users to fetch their own data, or allow Admins to fetch any user
  if (req.user._id !== id && !req.roles?.includes("Admin")) {
    return res.status(403).json({ message: "Access denied. You can only view your own profile." });
  }

  const user = await User.findById(id)
    .select("-password")
    .lean();

  if (!user) {
    return res.status(404).json({ message: "User not found." });
  }

  res.json(user);
});

// Helper to generate unique User ID
const generateUserId = async (role) => {
  const date = new Date();
  const year = date.getFullYear();
  const prefix = "GTX";
  
  // Find the last user created this year
  const lastUser = await User.findOne({
    userId: new RegExp(`^${prefix}-${year}-`),
  }).sort({ createdAt: -1 });

  let sequence = 1;
  if (lastUser && lastUser.userId) {
    const parts = lastUser.userId.split("-");
    const lastSequence = parseInt(parts[parts.length - 1]);
    if (!isNaN(lastSequence)) {
      sequence = lastSequence + 1;
    }
  }

  const paddedSequence = sequence.toString().padStart(4, "0");
  return `${prefix}-${year}-${paddedSequence}`;
};

// @desc    Create new user
// @route   POST /api/users
// @access  Private
const createUser = asyncHandler(async (req, res) => {
  const {
    firstName,
    lastName,
    email,
    password,
    role,
    title,
    phone,
    gender,
    department,
    permissions,
    isActive,
    ...otherFields
  } = req.body;

  if (!firstName || !lastName || !email || !password || !role) {
    return res.status(400).json({ message: "Required fields missing." });
  }

  const duplicateEmail = await User.findOne({ email }).lean().exec();
  if (duplicateEmail) {
    return res.status(409).json({ message: "Email already in use." });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const generatedId = await generateUserId(role);

  const userObject = {
    userId: generatedId,
    firstName,
    lastName,
    email,
    password: hashedPassword,
    role: Array.isArray(role) ? role : [role],
    title,
    phone,
    gender,
    department,
    permissions,
    isActive: typeof isActive === "boolean" ? isActive : true,
    ...otherFields,
  };

  const user = await User.create(userObject);

  if (!user) {
    return res.status(400).json({ message: "Invalid user data." });
  }

  res.status(201).json({
    message: `User ${user.firstName} ${user.lastName} created successfully.`,
  });
});

// @desc    Update user
// @route   PATCH /api/users
// @access  Private
const updateUser = asyncHandler(async (req, res) => {
  const {
    id,
    userId,
    firstName,
    lastName,
    email,
    password,
    role,
    title,
    phone,
    address,
    preferredLanguage,
    receiveSMS,
    receiveEmail,
    dateOfBirth,
    maritalStatus,
    bloodGroup,
    gender,
    department,
    permissions,
    isActive,
    status,
    updatedBy,
    ...otherFields
  } = req.body;

  if (!id || !email) {
    return res.status(400).json({ message: "User ID and email are required." });
  }

  const user = await User.findById(id).exec();
  if (!user) return res.status(404).json({ message: "User not found." });

  const duplicateEmail = await User.findOne({ email }).lean().exec();
  if (duplicateEmail && duplicateEmail._id.toString() !== id) {
    return res.status(409).json({ message: "Email already in use." });
  }

  user.userId = userId ?? user.userId;
  user.firstName = firstName ?? user.firstName;
  user.lastName = lastName ?? user.lastName;
  user.email = email;
  user.phone = phone ?? user.phone;
  user.gender = gender ?? user.gender;
  user.department = department ?? user.department;
  user.title = title ?? user.title;
  user.permissions = permissions ?? user.permissions;
  user.address = address ?? user.address;
  user.preferredLanguage = preferredLanguage ?? user.preferredLanguage;
  user.receiveSMS =
    typeof receiveSMS === "boolean" ? receiveSMS : user.receiveSMS;
  user.receiveEmail =
    typeof receiveEmail === "boolean" ? receiveEmail : user.receiveEmail;
  user.dateOfBirth = dateOfBirth ?? user.dateOfBirth;
  user.maritalStatus = maritalStatus ?? user.maritalStatus;
  user.bloodGroup = bloodGroup ?? user.bloodGroup;
  user.updatedBy = updatedBy ?? user.updatedBy;
  user.role = role ? (Array.isArray(role) ? role : [role]) : user.role;
  user.status = status ?? user.status;
  
  // Sync isActive with status if status was provided
  if (status) {
    user.isActive = status === "Active";
  } else {
    user.isActive = typeof isActive === "boolean" ? isActive : user.isActive;
  }

  // ✅ Conditionally assign other dynamic fields
  for (const [key, value] of Object.entries(otherFields)) {
    if (value !== undefined) {
      user[key] = value;
    }
  }

  if (password) {
    user.password = await bcrypt.hash(password, 10);
  }

  user.updatedAt = new Date();

  // Log activity
  user.activities.unshift({
    action: "Administrative Update",
    details: status ? `Account status changed to ${status}` : "Profile information modified by Admin",
    timestamp: new Date(),
  });
  if (user.activities.length > 20) user.activities = user.activities.slice(0, 20);

  const updated = await user.save();

  res.json({
    message: `User ${updated.firstName} ${updated.lastName} updated successfully.`,
  });
});

// @desc    Delete user
// @route   DELETE /api/users
// @access  Private
const deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.body;

  if (!id) return res.status(400).json({ message: "User ID required." });

  const user = await User.findById(id).exec();
  if (!user) return res.status(404).json({ message: "User not found." });

  await user.deleteOne();

  res.json({
    message: `User ${user.firstName} ${user.lastName} deleted successfully.`,
  });
});

// @desc    Change user password
// @route   POST /api/users/change-password
// @access  Private
const changePassword = asyncHandler(async (req, res) => {
  const { id, currentPassword, newPassword } = req.body;

  if (!id || !currentPassword || !newPassword) {
    return res.status(400).json({ message: "All fields are required." });
  }

  const user = await User.findById(id).select("+password").exec();
  if (!user) return res.status(404).json({ message: "User not found." });

  // Security: Only allow users to change their own password
  if (req.user._id.toString() !== id) {
    return res.status(403).json({ message: "Forbidden: You can only change your own password." });
  }

  const match = await bcrypt.compare(currentPassword, user.password);
  if (!match) {
    return res.status(400).json({ message: "Current password is incorrect." });
  }

  user.password = await bcrypt.hash(newPassword, 10);
  user.updatedAt = new Date();

  // Log activity
  user.activities.unshift({
    action: "Password Change",
    details: "User password updated manually from settings",
    timestamp: new Date(),
  });
  if (user.activities.length > 20) user.activities = user.activities.slice(0, 20);

  await user.save();

  res.json({ message: "Password changed successfully." });
});

module.exports = {
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
  changePassword,
};
