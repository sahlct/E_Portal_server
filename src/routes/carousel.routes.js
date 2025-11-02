import express from "express";
import {
  createCarousel,
  updateCarousel,
  deleteCarousel,
  listCarousel,
  getCarousel,
} from "../controllers/carousel.controller.js";
import { createUploadMiddleware } from "../middlewares/upload.middleware.js";
import authMiddleware from "../middlewares/auth.middleware.js";

const router = express.Router();

router.get("/", listCarousel);
router.get("/:id", getCarousel);

const uploadCarouselFiles = createUploadMiddleware({
  fields: [
    { name: "desktop_file", maxCount: 1 },
    { name: "mobile_file", maxCount: 1 },
  ],
  folderName: "carousel",
  maxSize: 6 * 1024 * 1024,
});

router.use(authMiddleware);
router.post("/", uploadCarouselFiles, createCarousel);
router.put("/:id", uploadCarouselFiles, updateCarousel);
router.delete("/:id", deleteCarousel);

export default router;
