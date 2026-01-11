import { Router } from "express";
import * as controller from "../controllers/subCategory.controller.js";
import authMiddleware from "../middlewares/auth.middleware.js";
import { createUploadMiddleware } from "../middlewares/upload.middleware.js";

const router = Router();

const uploadSubCategoryImage = createUploadMiddleware({
  fieldName: "sub_category_image",
  folderName: "sub-category",
  maxSize: 5 * 1024 * 1024,
});

/* PUBLIC */
router.get("/", controller.listSubCategories);
router.get("/:id", controller.getSubCategory);

/* PROTECTED */
router.use(authMiddleware);

router.post("/", uploadSubCategoryImage, controller.createSubCategory);
router.put("/:id", uploadSubCategoryImage, controller.updateSubCategory);
router.delete("/:id", controller.deleteSubCategory);

export default router;
