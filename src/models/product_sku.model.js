import mongoose from "mongoose";

const productSkuSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true, unique: true },
    product_sku_name: { type: String, required: true },
    description: { type: String },
    thumbnail_image: { type: String },
    mrp: { type: Number, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true },
    is_new: { type: Boolean, default: false },
    single_order_limit: { type: Number, default: 1 },
    is_out_of_stock: { type: Boolean, default: false },
    product_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    status: { type: Number, default: 1 }, 
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

const ProductSku = mongoose.model("ProductSku", productSkuSchema);
export default ProductSku;
