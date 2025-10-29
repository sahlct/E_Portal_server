import mongoose from "mongoose";

const productCategorySchema = new mongoose.Schema(
  {
    category_name: { type: String, required: true, trim: true, unique: true },
    category_image: { type: String, default: null }, // will store full URL: SERVER_URL/uploads/category/<file>
    status: { type: Number, enum: [0, 1], default: 1 }, // store as bit-like number 0 or 1
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

// create case-insensitive unique index if desired (optional):
// productCategorySchema.index({ category_name: 1 }, { unique: true, collation: { locale: "en", strength: 2 } });

const ProductCategory = mongoose.model("ProductCategory", productCategorySchema);
export default ProductCategory;
