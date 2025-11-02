import express from "express";
import {
  createBrands,
  listBrands,
  getBrand,
  updateBrand,
  deleteBrand,
  deleteMultipleBrands,
  bulkUpdateBrandStatus,
} from "../controllers/brand.controller.js";
import { createUploadMiddleware } from "../middlewares/upload.middleware.js";
import authMiddleware from "../middlewares/auth.middleware.js";

const router = express.Router();

// Public routes
router.get("/", listBrands);
router.get("/:id", getBrand);

// File upload (multiple logos at once)
const uploadBrandFiles = createUploadMiddleware({
  fields: [{ name: "brand_logo", maxCount: 20 }], // allow multiple
  folderName: "brands",
  maxSize: 6 * 1024 * 1024,
});

router.use(authMiddleware);

// Protected routes
router.post("/", uploadBrandFiles, createBrands);
router.put("/:id", uploadBrandFiles, updateBrand);
router.delete("/:id", deleteBrand);
router.post("/bulk-status", bulkUpdateBrandStatus); 
router.post("/delete-multiple", deleteMultipleBrands);

export default router;
