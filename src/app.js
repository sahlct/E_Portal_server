import express from "express";
import morgan from "morgan";
import helmet from "helmet";
import cors from "cors";
import path from "path";

import authRoutes from "./routes/auth.routes.js";
import errorHandler from "./middlewares/error.middleware.js";
import productCategoryRoutes from "./routes/productCategory.routes.js"
import productRoutes from "./routes/product.routes.js";
import skuRoutes from "./routes/product_sku.routes.js"

const app = express();

const uploadsPath = path.join(process.cwd(), "uploads");
app.use("/uploads", express.static(uploadsPath));

// Middlewares
app.use(helmet());
app.use(cors());
app.use(express.json());
if (process.env.NODE_ENV === "development") app.use(morgan("dev"));

// Routes
app.get("/health", (req, res) => res.json({ ok: true }));
app.use("/api/auth", authRoutes);
app.use("/api/categories", productCategoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/product-sku", skuRoutes)

// Error handling
app.use(errorHandler);

export default app;
