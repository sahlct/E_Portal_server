import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    product_name: {
      type: String,
      required: true,
      trim: true,
    },

    product_image: {
      type: String,
      default: null,
    },
    category_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductCategory",
      required: true,
    },
    sub_category_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductSubCategory",
      required: true,
    },
    inner_category_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InnerCategory",
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
    advantages: {
      type: [String],
      default: [],
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

productSchema.index({
  category_id: 1,
  sub_category_id: 1,
  inner_category_id: 1,
});

const Product = mongoose.model("Product", productSchema);
export default Product;
