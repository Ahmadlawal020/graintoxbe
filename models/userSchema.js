const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    // Identification
    userId: { type: String, required: true, unique: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    otherNames: String,
    title: {
      type: String,
      enum: ["Mr", "Mrs", "Miss", "Dr", "Prof", "Alhaji", "Chief"],
    },

    // Role & Status
    role: {
      type: [String],
      required: true,
      enum: ["Admin", "User", "Warehouse_Manager"],
    },
    status: {
      type: String,
      enum: ["Active", "Suspended", "Pending"],
      default: "Active",
    },

    // KYC
    kycStatus: {
      type: String,
      enum: ["PENDING", "VERIFIED", "REJECTED", "UNDER_REVIEW"],
      default: "PENDING",
    },
    kycDocType: String,
    kycDocumentUrl: String,
    kycDocumentBackUrl: String,
    kycLivePhotoUrl: String,
    kycSubmittedAt: Date,

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    password: { type: String, required: true, select: false },
    passwordResetToken: String,
    passwordResetExpires: Date,
    lastLogin: Date,

    // Platform-specific
    department: String,
    walletBalance: { type: Number, default: 0 },
    assignedWarehouse: [String],

    // Profile Details
    farmLocation: String,
    cropTypes: [String],
    investorTier: {
      type: String,
      enum: ["Bronze", "Gold", "Platinum"],
      default: "Bronze",
    },
    portfolioValue: { type: Number, default: 0 },
    tokensHeld: { type: Number, default: 0 },
    holdings: [
      {
        crop: { type: mongoose.Schema.Types.ObjectId, ref: "Crop" },
        tokenSymbol: String,
        amount: { type: Number, default: 0 },
        averagePrice: { type: Number, default: 0 }
      }
    ],

    // Contact
    phone: String,
    alternatePhone: String,
    address: String,

    // Personal Info
    dateOfBirth: Date,
    gender: { type: String, enum: ["Male", "Female", "Other"] },
    maritalStatus: String,
    bloodGroup: String,

    // Verification
    isEmailVerified: { type: Boolean, default: false },

    // Preferences
    preferredLanguage: { type: String, default: "English" },
    receiveSMS: { type: Boolean, default: true },
    receiveEmail: { type: Boolean, default: true },

    // Status
    isActive: { type: Boolean, default: true },

    // Audit fields
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    // Timestamps
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
