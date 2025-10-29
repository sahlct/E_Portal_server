import express from "express";
import {
  createProductSku,
  getAllProductSkus,
  getSingleProductSku,
  updateProductSku,
  deleteProductSku,
} from "../controllers/product_sku.controller.js";
import verifyToken from "../middlewares/auth.middleware.js";
import { createUploadMiddleware } from "../middlewares/upload.middleware.js";

const uploadProductImage = createUploadMiddleware({
  fieldName: "thumbnail_image",
  folderName: "product",
  maxSize: 6 * 1024 * 1024, 
});

const router = express.Router();

router.post("/", verifyToken, uploadProductImage, createProductSku);
router.get("/", verifyToken, getAllProductSkus);
router.get("/:id", verifyToken, getSingleProductSku);
router.put("/:id", verifyToken, uploadProductImage, updateProductSku);
router.delete("/:id", verifyToken, deleteProductSku);

export default router;
