const mongoose = require("mongoose");

const storageSchema = new mongoose.Schema(
  {
    type: { 
      type: String, 
      required: true, 
      enum: ["DEPOSIT", "WITHDRAWAL", "TRANSFER"] 
    },
    commodity: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Crop", 
      required: true 
    },
    quantity: { 
      type: Number, 
      required: true 
    },
    unit: { 
      type: String, 
      default: "kg" 
    },
    warehouse: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Warehouse", 
      required: true 
    },
    user: { 
      type: String, 
      required: function() { return this.type !== "TRANSFER"; } 
    },
    agent: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User"
    },
    status: { 
      type: String, 
      enum: ["PENDING", "APPROVED", "REJECTED", "DEPOSITED", "CANCELLED"], 
      default: "PENDING" 
    },
    deliveryMethod: {
      type: String,
      enum: ["DROP_OFF", "PICK_UP"],
      default: "DROP_OFF"
    },
    qcStatus: { 
      type: String, 
      enum: ["PASSED", "PENDING", "FAILED"], 
      default: "PENDING" 
    },
    moisture: { type: Number },
    foreignMatter: { type: Number },
    pestDamage: { type: Number },
    qcRemarks: { type: String },
    receiptNo: { 
      type: String, 
      required: true, 
      unique: true 
    },
    timestamp: { 
      type: Date, 
      default: Date.now 
    },
    notes: String
  },
  { timestamps: true }
);

module.exports = mongoose.model("Storage", storageSchema);
