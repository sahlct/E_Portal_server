import express from "express";
import {
  createBrand,
  updateBrand,
  deleteBrand,
  listBrands,
  getBrand,
} from "../controllers/brands.controller.js";

import { createUploadMiddleware } from "../middlewares/upload.middleware.js";
import authMiddleware from "../middlewares/auth.middleware.js";

const router = express.Router();

/* ---------------- PUBLIC ROUTES ---------------- */
router.get("/", listBrands);
router.get("/:id", getBrand);

/* ---------------- UPLOAD MIDDLEWARE ---------------- */
const uploadBrandImage = createUploadMiddleware({
  fields: [{ name: "brand_image", maxCount: 1 }],
  folderName: "brands",
  maxSize: 5 * 1024 * 1024, // 5MB
});

/* ---------------- PROTECTED ROUTES ---------------- */
router.use(authMiddleware);
router.post("/", uploadBrandImage, createBrand);
router.put("/:id", uploadBrandImage, updateBrand);
router.delete("/:id", deleteBrand);

export default router;
