import express from "express";
import {
  createBanner,
  updateBanner,
  deleteBanner,
  listBanners,
  getBanner,
} from "../controllers/banner.controller.js";
import { createUploadMiddleware } from "../middlewares/upload.middleware.js";
import authMiddleware from "../middlewares/auth.middleware.js";

const router = express.Router();

/* -------- PUBLIC -------- */
router.get("/", listBanners);
router.get("/:id", getBanner);

/* -------- UPLOAD -------- */
const uploadBannerImage = createUploadMiddleware({
  fields: [{ name: "banner_image", maxCount: 1 }],
  folderName: "banners",
  maxSize: 6 * 1024 * 1024,
});

/* -------- PROTECTED -------- */
router.use(authMiddleware);
router.post("/", uploadBannerImage, createBanner);
router.put("/:id", uploadBannerImage, updateBanner);
router.delete("/:id", deleteBanner);

export default router;
