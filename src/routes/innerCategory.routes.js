import { Router } from "express";
import * as controller from "../controllers/innerCategory.controller.js";
import authMiddleware from "../middlewares/auth.middleware.js";
// import { createUploadMiddleware } from "../middlewares/upload.middleware.js";
import multer from "multer";

const router = Router();
const parseFormData = multer().none();

// const uploadInnerCategoryImage = createUploadMiddleware({
//   fieldName: "inner_category_image",
//   folderName: "inner-category",
//   maxSize: 5 * 1024 * 1024,
// });

/* PUBLIC */
router.get("/", controller.listInnerCategories);
router.get("/:id", controller.getInnerCategory);

/* PROTECTED */
router.use(authMiddleware);

router.post("/", parseFormData, controller.createInnerCategory);
router.put("/:id", parseFormData, controller.updateInnerCategory);
router.delete("/:id", controller.deleteInnerCategory);

export default router;
