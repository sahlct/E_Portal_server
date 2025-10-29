import { Router } from "express";
import * as controller from "../controllers/product.controller.js";
import authMiddleware from "../middlewares/auth.middleware.js";
import { createUploadMiddleware } from "../middlewares/upload.middleware.js";

const router = Router();

const uploadProductImage = createUploadMiddleware({
  fieldName: "product_image",
  folderName: "product",
  maxSize: 6 * 1024 * 1024,
});

router.use(authMiddleware);

router.post(
  "/with-variation",
  uploadProductImage,
  controller.createProductWithVariations
);

router.post("/", uploadProductImage, controller.createProduct);
router.get("/", controller.listProducts);
router.get("/:id", controller.getProduct);
router.put("/:id", uploadProductImage, controller.updateProduct);
router.delete("/:id", controller.deleteProduct);

export default router;
