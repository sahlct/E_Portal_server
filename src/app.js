import express from "express";
import morgan from "morgan";
import helmet from "helmet";
import cors from "cors";
import path from "path";
import dotenv from "dotenv";

import authRoutes from "./routes/auth.routes.js";
import errorHandler from "./middlewares/error.middleware.js";
import productCategoryRoutes from "./routes/productCategory.routes.js";
import productRoutes from "./routes/product.routes.js";
import skuRoutes from "./routes/product_sku.routes.js";
import carouselRoutes from "./routes/carousel.routes.js";
// import brandRoutes from "./routes/brand.routes.js";
import blogsRoutes from "./routes/blog.routes.js";
import brandsRoutes from "./routes/brands.routes.js";
import bannerRoutes from "./routes/banner.routes.js";

const app = express();
dotenv.config();

// Static uploads
const uploadsPath = path.join(process.cwd(), "uploads");
app.use("/uploads", express.static(uploadsPath));

// Security middlewares
app.use(helmet());

//  Allow all origins, methods, and headers
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// JSON parser
app.use(express.json());

// Logger
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// Routes
app.get("/health", (req, res) => res.json({ ok: true }));
app.use("/api/auth", authRoutes);
app.use("/api/categories", productCategoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/product-sku", skuRoutes);
app.use("/api/carousel", carouselRoutes);
// app.use("/api/brand", brandRoutes);
app.use("/api/blogs", blogsRoutes);
app.use("/api/brands", brandsRoutes);
app.use("/api/banners", bannerRoutes);


// Error handler
app.use(errorHandler);

export default app;
