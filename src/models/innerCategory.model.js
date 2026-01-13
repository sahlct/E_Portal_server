import mongoose from "mongoose";

const innerCategorySchema = new mongoose.Schema(
  {
    inner_category_name: {
      type: String,
      required: true,
      trim: true,
    },
    // inner_category_image: {
    //   type: String,
    //   default: null,
    // },
    category_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    sub_category_id: {
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

const InnerCategory = mongoose.model(
  "InnerCategory",
  innerCategorySchema
);

export default InnerCategory;
