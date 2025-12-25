import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    product_name: { type: String, required: true, trim: true },
    product_image: { type: String, default: null },

    // MULTIPLE CATEGORIES SUPPORT
    category_id: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ProductCategory",
      },
    ],

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

    advantages: {
      type: [String],
      default: [],
    },

    status: { type: Number, enum: [0, 1], default: 1 },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

const Product = mongoose.model("Product", productSchema);
export default Product;
