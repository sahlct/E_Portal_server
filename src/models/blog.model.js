import mongoose from "mongoose";

const blogSchema = new mongoose.Schema(
  {
    blog_title: { type: String, required: true, trim: true },
    blog_thumbnail: { type: String, required: true },
    blog_sec_title: { type: String, default: null, trim: true },
    description: { type: String, default: null, trim: true },
    date: { type: Date, required: true },
    place: { type: String, default: null, trim: true },
    other_images: { type: [String], default: [] }, // JSON array for multiple image URLs
    status: { type: Number, enum: [0, 1], default: 1 },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

const Blog = mongoose.model("Blog", blogSchema);
export default Blog;
