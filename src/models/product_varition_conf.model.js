import mongoose from "mongoose";

const productVariationConfigurationSchema = new mongoose.Schema(
  {
    product_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: [true, "Product ID is required"],
    },
    product_sku_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductSKU",
      required: [true, "Product SKU ID is required"],
    },
    product_variation_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductVariation",
      required: [true, "Product Variation ID is required"],
    },
    product_variation_option_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductVariationOption",
      required: [true, "Product Variation Option ID is required"],
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

const ProductVariationConfiguration = mongoose.model(
  "ProductVariationConfiguration",
  productVariationConfigurationSchema
);

export default ProductVariationConfiguration;
