const mongoose = require("mongoose");

const warehouseSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    warehouseType: { type: String, enum: ["Silo", "Flat Store", "Cold Storage", "Open Yard"], default: "Silo" },
    capacity: { type: Number, required: true }, // in kg
    availableCapacity: { type: Number },
    status: { type: String, enum: ["Active", "Maintenance", "Inactive"], default: "Active" },
    
    // Certifications & Compliance
    certNumber: String,
    certExpiry: Date,
    insuranceProvider: String,
    insuranceStatus: { type: String, enum: ["Valid", "Expired", "Pending"], default: "Pending" },

    // Location
    location: { type: String, required: true },
    state: { type: String, required: true },
    coordinates: {
      lat: Number,
      lng: Number
    },

    // Owner Details
    ownerName: { type: String, required: true },
    companyName: String,
    ownerPhone: String,
    ownerEmail: String,

    // Manager Assignment
    managerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    // Financials
    storageFeePerKg: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Warehouse", warehouseSchema);
