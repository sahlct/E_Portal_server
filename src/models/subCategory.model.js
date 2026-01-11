import mongoose from "mongoose";

const productSubCategorySchema = new mongoose.Schema(
  {
    sub_category_name: {
      type: String,
      required: true,
      trim: true,
    },
    sub_category_image: {
      type: String,
      default: null,
    },
    category_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    status: {
      type: Number,
      enum: [0, 1],
      default: 1,
    },
  },
  {
    timestamps: {
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  }
);

const ProductSubCategory = mongoose.model(
  "ProductSubCategory",
  productSubCategorySchema
);

export default ProductSubCategory;
