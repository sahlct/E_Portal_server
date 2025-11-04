import express from "express";
import {
  createBlog,
  updateBlog,
  deleteBlog,
  listBlogs,
  getBlog,
} from "../controllers/blog.controller.js";
import { createUploadMiddleware } from "../middlewares/upload.middleware.js";
import authMiddleware from "../middlewares/auth.middleware.js";

const router = express.Router();

// Public routes
router.get("/", listBlogs);
router.get("/:id", getBlog);

// Upload middleware for thumbnail + multiple images
const uploadBlogFiles = createUploadMiddleware({
  fields: [
    { name: "blog_thumbnail", maxCount: 1 },
    { name: "other_images", maxCount: 10 }, // allow multiple uploads
  ],
  folderName: "blogs",
  maxSize: 6 * 1024 * 1024, // 6MB each
});

// Protected routes
router.use(authMiddleware);
router.post("/", uploadBlogFiles, createBlog);
router.put("/:id", uploadBlogFiles, updateBlog);
router.delete("/:id", deleteBlog);

export default router;
