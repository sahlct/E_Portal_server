import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    product_name: { type: String, required: true, trim: true },
    product_image: { type: String, default: null },

    category_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductCategory",
      required: true,
    },

    brand_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brands",
      default: null,
    },
    features: {
      type: [
        {
          option: { type: String, trim: true },
          value: { type: String, trim: true },
        },
      ],
      default: [],
    },

    status: { type: Number, enum: [0, 1], default: 1 },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

const Product = mongoose.model("Product", productSchema);
export default Product;
