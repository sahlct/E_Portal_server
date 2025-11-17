import mongoose from "mongoose";

const productVariationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Variation name is required"],
      trim: true,
    },
    product_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: [true, "Product ID is required"],
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

const ProductVariation = mongoose.model("ProductVariation", productVariationSchema);

export default ProductVariation;
