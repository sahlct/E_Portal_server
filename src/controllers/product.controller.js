import Product from "../models/product.model.js";
import ProductCategory from "../models/productCategory.model.js";
import ProductVariation from "../models/product_variation.model.js";
import ProductVariationOption from "../models/product_variation_options.model.js";
import { deleteUploadedFile } from "../middlewares/upload.middleware.js";
import mongoose from "mongoose";


/* Helpers */
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildFileUrl = (filename, folder = "product") => {
  if (!filename) return null;
  const serverUrl = process.env.SERVER_URL || "";
  return `${serverUrl.replace(/\/$/, "")}/uploads/${folder}/${filename}`;
};

export const createProductWithVariations = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { product_name, category_id } = req.body;
    let { status, variations } = req.body;

    // parse variations JSON string if sent as text (form-data)
    if (typeof variations === "string") {
      try {
        variations = JSON.parse(variations);
      } catch (e) {
        throw new Error("Invalid variations JSON format");
      }
    }

    // ✅ Basic validation
    if (!product_name || !product_name.trim()) {
      if (req.file) deleteUploadedFile(req.file?.path || req.file?.filename);
      return res.status(400).json({ message: "product_name is required" });
    }
    if (!category_id) {
      if (req.file) deleteUploadedFile(req.file?.path || req.file?.filename);
      return res.status(400).json({ message: "category_id is required" });
    }

    // ✅ Check category exists
    const categoryExists = await ProductCategory.findById(category_id).session(session);
    if (!categoryExists) {
      if (req.file) deleteUploadedFile(req.file?.path || req.file?.filename);
      return res.status(400).json({ message: "Invalid category_id" });
    }

    // ✅ Validate status
    if (typeof status === "undefined" || status === null || status === "") {
      status = 1;
    } else {
      status = Number(status);
      if (![0, 1].includes(status)) {
        if (req.file) deleteUploadedFile(req.file?.path || req.file?.filename);
        return res.status(400).json({ message: "status must be 0 or 1" });
      }
    }

    // ✅ Handle file upload
    let fileUrl = null;
    if (req.file) {
      fileUrl = buildFileUrl(req.file.filename, "product");
    }

    // ✅ Create Product
    const product = await Product.create(
      [
        {
          product_name: product_name.trim(),
          product_image: fileUrl,
          category_id,
          status,
        },
      ],
      { session }
    );

    const productId = product[0]._id;

    // ✅ Create variations
    if (Array.isArray(variations) && variations.length > 0) {
      for (const v of variations) {
        if (!v.variation_name || !Array.isArray(v.options) || v.options.length === 0) {
          throw new Error("Each variation must have a name and options array");
        }

        // create variation
        const variation = await ProductVariation.create(
          [
            {
              name: v.variation_name.trim(),
              product_id: productId,
              status: 1,
            },
          ],
          { session }
        );

        // create each option
        for (const optName of v.options) {
          if (!optName || !String(optName).trim()) continue;

          await ProductVariationOption.create(
            [
              {
                name: optName.trim(),
                product_id: productId,
                product_variation_id: variation[0]._id,
                status: 1,
              },
            ],
            { session }
          );
        }
      }
    }

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      message: "Product with variations created successfully",
      data: { product_id: productId },
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    if (req.file) deleteUploadedFile(req.file?.path || req.file?.filename);
    console.error("Error creating product with variations:", err);
    res.status(500).json({ message: err.message || "Something went wrong" });
  }
};

/* CREATE - form-data (product_name, category_id, status, product_image) */
export const createProduct = async (req, res, next) => {
  try {
    const { product_name, category_id } = req.body;
    let { status } = req.body;

    // required fields
    if (!product_name || !String(product_name).trim()) {
      if (req.file) deleteUploadedFile(req.file?.path || req.file?.filename || req.file?.location);
      return res.status(400).json({ message: "product_name is required" });
    }
    if (!category_id || !String(category_id).trim()) {
      if (req.file) deleteUploadedFile(req.file?.path || req.file?.filename || req.file?.location);
      return res.status(400).json({ message: "category_id is required" });
    }
    // status required for products as per your spec
    if (typeof status === "undefined" || status === null || status === "") {
      if (req.file) deleteUploadedFile(req.file?.path || req.file?.filename || req.file?.location);
      return res.status(400).json({ message: "status is required and must be 0 or 1" });
    }

    // validate status
    status = Number(status);
    if (![0, 1].includes(status)) {
      if (req.file) deleteUploadedFile(req.file?.path || req.file?.filename || req.file?.location);
      return res.status(400).json({ message: "status must be 0 or 1" });
    }

    // validate category exists
    const category = await ProductCategory.findById(category_id);
    if (!category) {
      if (req.file) deleteUploadedFile(req.file?.path || req.file?.filename || req.file?.location);
      return res.status(400).json({ message: "Invalid category_id" });
    }

    // handle file if present
    let fileUrl = null;
    if (req.file) {
      fileUrl = buildFileUrl(req.file.filename, "product");
    }

    const doc = await Product.create({
      product_name: product_name.trim(),
      product_image: fileUrl,
      category_id,
      status,
    });

    res.status(201).json({ message: "Product created", data: doc });
  } catch (err) {
    if (req.file) deleteUploadedFile(req.file?.path || req.file?.filename || req.file?.location);
    next(err);
  }
};

/* LIST - pagination + search + status + category_id filter */
export const listProducts = async (req, res, next) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);
    const search = req.query.search?.trim();
    const status = typeof req.query.status !== "undefined" ? req.query.status : undefined;
    const category_id = req.query.category_id?.trim();

    const filter = {};
    if (search) filter.product_name = { $regex: escapeRegExp(search), $options: "i" };
    if (typeof status !== "undefined") {
      const s = Number(status);
      if (![0, 1].includes(s)) return res.status(400).json({ message: "status filter must be 0 or 1" });
      filter.status = s;
    }
    if (category_id) {
      // validate ObjectId format before using (optional)
      filter.category_id = category_id;
    }

    const skip = (page - 1) * limit;

    const [total, items] = await Promise.all([
      Product.countDocuments(filter),
      Product.find(filter)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    res.json({
      meta: { total, page, limit, pages: Math.ceil(total / limit) || 1 },
      data: items,
    });
  } catch (err) {
    next(err);
  }
};

/* GET SINGLE */
export const getProduct = async (req, res, next) => {
  try {
    const doc = await Product.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ message: "Product not found" });
    res.json({ data: doc });
  } catch (err) {
    next(err);
  }
};

/* UPDATE - form-data allowed (product_name, category_id, status, product_image) */
export const updateProduct = async (req, res, next) => {
  try {
    const id = req.params.id;
    const { product_name, category_id } = req.body;
    let { status } = req.body;

    const existing = await Product.findById(id);
    if (!existing) {
      if (req.file) deleteUploadedFile(req.file?.path || req.file?.filename || req.file?.location);
      return res.status(404).json({ message: "Product not found" });
    }

    // product_name validation if present
    if (typeof product_name !== "undefined") {
      if (!String(product_name).trim()) {
        if (req.file) deleteUploadedFile(req.file?.path || req.file?.filename || req.file?.location);
        return res.status(400).json({ message: "product_name cannot be empty" });
      }
      existing.product_name = product_name.trim();
    }

    // category_id validation if present
    if (typeof category_id !== "undefined") {
      if (!String(category_id).trim()) {
        if (req.file) deleteUploadedFile(req.file?.path || req.file?.filename || req.file?.location);
        return res.status(400).json({ message: "category_id cannot be empty" });
      }
      const cat = await ProductCategory.findById(category_id);
      if (!cat) {
        if (req.file) deleteUploadedFile(req.file?.path || req.file?.filename || req.file?.location);
        return res.status(400).json({ message: "Invalid category_id" });
      }
      existing.category_id = category_id;
    }

    // status if present (if not present, keep existing)
    if (typeof status !== "undefined" && status !== null && status !== "") {
      status = Number(status);
      if (![0, 1].includes(status)) {
        if (req.file) deleteUploadedFile(req.file?.path || req.file?.filename || req.file?.location);
        return res.status(400).json({ message: "status must be 0 or 1" });
      }
      existing.status = status;
    }

    // file handling - if new file uploaded, delete old and set new URL
    if (req.file) {
      if (existing.product_image) {
        deleteUploadedFile(existing.product_image);
      }
      existing.product_image = buildFileUrl(req.file.filename, "product");
    }

    const updated = await existing.save();
    res.json({ message: "Product updated", data: updated });
  } catch (err) {
    if (req.file) deleteUploadedFile(req.file?.path || req.file?.filename || req.file?.location);
    next(err);
  }
};

/* DELETE */
export const deleteProduct = async (req, res, next) => {
  try {
    const id = req.params.id;
    const doc = await Product.findById(id);
    if (!doc) return res.status(404).json({ message: "Product not found" });

    if (doc.product_image) deleteUploadedFile(doc.product_image);

    await Product.deleteOne({ _id: id });
    res.json({ message: "Product deleted" });
  } catch (err) {
    next(err);
  }
};
