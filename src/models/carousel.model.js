import mongoose from "mongoose";

const carouselSchema = new mongoose.Schema(
  {
    title: { type: String, default: null, trim: true },
    sub_title: { type: String, default: null, trim: true },
    description: { type: String, default: null, trim: true },
    desktop_file: { type: String, required: true },
    mobile_file: { type: String, default: null },
    status: { type: Number, enum: [0, 1], default: 1 },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

const Carousel = mongoose.model("Carousel", carouselSchema);
export default Carousel;
