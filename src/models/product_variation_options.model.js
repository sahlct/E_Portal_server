import mongoose from "mongoose";

const productVariationOptionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Option name is required"],
      trim: true,
    },
    product_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: [true, "Product ID is required"],
    },
    product_variation_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductVariation",
      required: [true, "Product Variation ID is required"],
    },
    status: {
      type: Number,
      enum: [0, 1], 
      default: 1,
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

const ProductVariationOption = mongoose.model(
  "ProductVariationOption",
  productVariationOptionSchema
);

export default ProductVariationOption;
