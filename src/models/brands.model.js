import mongoose from "mongoose";

const brandSchema = new mongoose.Schema(
  {
    brand_name: { type: String, required: true, trim: true },
    brand_image: { type: String, required: true },
    is_popular: { type: Boolean, default: false },
    status: { type: Number, enum: [0, 1], default: 1 },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

const Brand = mongoose.model("Brands", brandSchema);
export default Brand;
