import express from "express";
import {
  createProductSku,
  getAllProductSkus,
  getSingleProductSku,
  updateProductSku,
  deleteProductSku,
  createProductSkuWithVariation,
  updateProductSkuWithVariation,
  updateMultipleSkuIsNew,
  getVariationsByProductId,
} from "../controllers/product_sku.controller.js";
import verifyToken from "../middlewares/auth.middleware.js";
import { createUploadMiddleware } from "../middlewares/upload.middleware.js";

const uploadProductImage = createUploadMiddleware({
  fieldName: "thumbnail_image",
  folderName: "product",
  maxSize: 6 * 1024 * 1024, 
});

const uploadSkuFiles = createUploadMiddleware({
  fields: [
    { name: "thumbnail_image", maxCount: 1 },
    { name: "sku_image", maxCount: 5 },
  ],
  folderName: "sku",
  maxSize: 6 * 1024 * 1024,
});

const router = express.Router();

router.post("/", verifyToken, uploadProductImage, createProductSku);
router.get("/", getAllProductSkus);
router.put("/singleEdit/is-new", verifyToken, updateMultipleSkuIsNew);
router.get("/:id", getSingleProductSku);
router.put("/:id", verifyToken, uploadProductImage, updateProductSku);

router.post("/with-variation", verifyToken, uploadSkuFiles, createProductSkuWithVariation);
router.put("/with-variation/:id", verifyToken, uploadSkuFiles, updateProductSkuWithVariation);
router.delete("/:id", verifyToken, deleteProductSku);


export default router;
