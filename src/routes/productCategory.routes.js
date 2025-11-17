import { Router } from "express";
import * as controller from "../controllers/productCategory.controller.js";
import authMiddleware from "../middlewares/auth.middleware.js";
import { createUploadMiddleware } from "../middlewares/upload.middleware.js";

const router = Router();

const uploadCategoryImage = createUploadMiddleware({
  fieldName: "category_image",
  folderName: "category",
  maxSize: 5 * 1024 * 1024, 
});


router.get("/", controller.listCategories);
router.get("/:id", controller.getCategory);


router.use(authMiddleware);

router.post("/", uploadCategoryImage, controller.createCategory);
router.put("/:id", uploadCategoryImage, controller.updateCategory);
router.delete("/:id", controller.deleteCategory);

export default router;
