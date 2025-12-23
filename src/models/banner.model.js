import mongoose from "mongoose";

const bannerSchema = new mongoose.Schema(
  {
    banner_title: { type: String, required: true, trim: true },
    banner_sub_title: { type: String, default: null, trim: true },
    banner_image: { type: String, required: true },

    // store only ObjectId (no constraint as requested)
    connected_category_id: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    status: { type: Number, enum: [0, 1], default: 1 },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

const Banner = mongoose.model("Banner", bannerSchema);
export default Banner;
