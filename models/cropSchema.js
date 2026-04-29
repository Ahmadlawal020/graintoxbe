const mongoose = require("mongoose");

const cropSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    code: { type: String, required: true, unique: true },
    category: { type: String, required: true, enum: ["Cereal", "Legume", "Tuber", "Other"] },
    totalStock: { type: Number, default: 0 },
    unit: { type: String, default: "kg" },
    pricePerUnit: { type: Number, required: true },
    priceChange: { type: Number, default: 0 }, 
    tokenSymbol: { type: String, required: true },
    totalTokenized: { type: Number, default: 0 },
    warehouses: { type: Number, default: 0 }, // count of warehouses holding this crop
    quality: { type: String, enum: ["Grade A", "Grade B", "Grade C"], default: "Grade A" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Crop", cropSchema);
