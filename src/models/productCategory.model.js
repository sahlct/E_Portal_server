import mongoose from "mongoose";

const productCategorySchema = new mongoose.Schema(
  {
    category_name: { type: String, required: true, trim: true, unique: true },
    category_image: { type: String, default: null },
    status: { type: Number, enum: [0, 1], default: 1 },
    
    // NEW FIELD
    is_listing: { type: Boolean, default: false }
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

const ProductCategory = mongoose.model("ProductCategory", productCategorySchema);
export default ProductCategory;
