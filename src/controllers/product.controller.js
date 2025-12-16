import Product from "../models/product.model.js";
import ProductCategory from "../models/productCategory.model.js";
import ProductVariation from "../models/product_variation.model.js";
import ProductVariationOption from "../models/product_variation_options.model.js";
import ProductVariationConfiguration from "../models/product_varition_conf.model.js";
import Brand from "../models/brands.model.js";
import { deleteUploadedFile } from "../middlewares/upload.middleware.js";
import mongoose from "mongoose";

/* Helpers */
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildFileUrl = (filename, folder = "product") => {
  if (!filename) return null;
  return `/uploads/${folder}/${filename}`;
};

// create with variation
export const createProductWithVariations = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { product_name, category_id, brand_id } = req.body;
    let { status, variations } = req.body;

    if (typeof variations === "string") {
      variations = JSON.parse(variations);
    }

    if (!product_name?.trim()) {
      if (req.file) deleteUploadedFile(req.file.path || req.file.filename);
      return res.status(400).json({ message: "product_name is required" });
    }

    if (!category_id) {
      if (req.file) deleteUploadedFile(req.file.path || req.file.filename);
      return res.status(400).json({ message: "category_id is required" });
    }

    const categoryExists =
      await ProductCategory.findById(category_id).session(session);
    if (!categoryExists) {
      if (req.file) deleteUploadedFile(req.file.path || req.file.filename);
      return res.status(400).json({ message: "Invalid category_id" });
    }

    // ✅ BRAND VALIDATION (NULL ALLOWED)
    let finalBrandId = null;
    if (brand_id) {
      const brandExists = await Brand.findById(brand_id).session(session);
      if (!brandExists) {
        if (req.file) deleteUploadedFile(req.file.path || req.file.filename);
        return res.status(400).json({ message: "Invalid brand_id" });
      }
      finalBrandId = brand_id;
    }

    if (status === undefined || status === "") status = 1;
    else {
      status = Number(status);
      if (![0, 1].includes(status))
        throw new Error("status must be 0 or 1");
    }

    let fileUrl = null;
    if (req.file) {
      fileUrl = buildFileUrl(req.file.filename, "product");
    }

    const product = await Product.create(
      [
        {
          product_name: product_name.trim(),
          product_image: fileUrl,
          category_id,
          brand_id: finalBrandId,
          status,
        },
      ],
      { session }
    );

    const productId = product[0]._id;

    // variations logic (UNCHANGED)
    if (Array.isArray(variations) && variations.length > 0) {
      for (const v of variations) {
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

        for (const optName of v.options) {
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
    if (req.file) deleteUploadedFile(req.file.path || req.file.filename);
    res.status(500).json({ message: err.message });
  }
};


// update with variation
export const updateProductWithVariations = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { product_name, category_id, brand_id } = req.body;
    let { status, variations } = req.body;
    const productId = req.params.id;

    if (typeof variations === "string") {
      variations = JSON.parse(variations);
    }

    const existingProduct =
      await Product.findById(productId).session(session);
    if (!existingProduct) {
      if (req.file) deleteUploadedFile(req.file.path || req.file.filename);
      return res.status(404).json({ message: "Product not found" });
    }

    if (product_name !== undefined)
      existingProduct.product_name = product_name.trim();

    if (category_id !== undefined) {
      const cat = await ProductCategory.findById(category_id).session(session);
      if (!cat) throw new Error("Invalid category_id");
      existingProduct.category_id = category_id;
    }

    // ✅ BRAND UPDATE LOGIC
    if (brand_id !== undefined) {
      if (!brand_id) {
        existingProduct.brand_id = null;
      } else {
        const brand = await Brand.findById(brand_id).session(session);
        if (!brand) throw new Error("Invalid brand_id");
        existingProduct.brand_id = brand_id;
      }
    }

    if (status !== undefined && status !== "") {
      status = Number(status);
      if (![0, 1].includes(status))
        throw new Error("status must be 0 or 1");
      existingProduct.status = status;
    }

    if (req.file) {
      if (existingProduct.product_image)
        deleteUploadedFile(existingProduct.product_image);
      existingProduct.product_image = buildFileUrl(
        req.file.filename,
        "product"
      );
    }

    await existingProduct.save({ session });

    // variations logic unchanged...
    await session.commitTransaction();
    session.endSession();

    res.json({ message: "Product with variations updated successfully" });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    if (req.file) deleteUploadedFile(req.file.path || req.file.filename);
    res.status(500).json({ message: err.message });
  }
};

// create
export const createProduct = async (req, res, next) => {
  try {
    const { product_name, category_id } = req.body;
    let { status } = req.body;

    // required fields
    if (!product_name || !String(product_name).trim()) {
      if (req.file)
        deleteUploadedFile(
          req.file?.path || req.file?.filename || req.file?.location
        );
      return res.status(400).json({ message: "product_name is required" });
    }
    if (!category_id || !String(category_id).trim()) {
      if (req.file)
        deleteUploadedFile(
          req.file?.path || req.file?.filename || req.file?.location
        );
      return res.status(400).json({ message: "category_id is required" });
    }
    // status required for products as per your spec
    if (typeof status === "undefined" || status === null || status === "") {
      if (req.file)
        deleteUploadedFile(
          req.file?.path || req.file?.filename || req.file?.location
        );
      return res
        .status(400)
        .json({ message: "status is required and must be 0 or 1" });
    }

    // validate status
    status = Number(status);
    if (![0, 1].includes(status)) {
      if (req.file)
        deleteUploadedFile(
          req.file?.path || req.file?.filename || req.file?.location
        );
      return res.status(400).json({ message: "status must be 0 or 1" });
    }

    // validate category exists
    const category = await ProductCategory.findById(category_id);
    if (!category) {
      if (req.file)
        deleteUploadedFile(
          req.file?.path || req.file?.filename || req.file?.location
        );
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
    if (req.file)
      deleteUploadedFile(
        req.file?.path || req.file?.filename || req.file?.location
      );
    next(err);
  }
};

// list
export const listProducts = async (req, res, next) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);
    const search = req.query.search?.trim();
    const status = req.query.status;
    const category_id = req.query.category_id?.trim();

    const filter = {};

    if (search)
      filter.product_name = { $regex: escapeRegExp(search), $options: "i" };

    if (status !== undefined) filter.status = Number(status);
    if (category_id) filter.category_id = category_id;

    const skip = (page - 1) * limit;

    const [total, items] = await Promise.all([
      Product.countDocuments(filter),
      Product.find(filter)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .populate("category_id", "category_name")
        .populate("brand_id", "brand_name")
        .lean(),
    ]);

    const formatted = items.map((i) => ({
      ...i,
      category_name: i.category_id?.category_name || null,
      category_id: i.category_id?._id || i.category_id,
      brand_name: i.brand_id?.brand_name || null,
      brand_id: i.brand_id?._id || null,
    }));

    res.json({
      meta: { total, page, limit, pages: Math.ceil(total / limit) || 1 },
      data: formatted,
    });
  } catch (err) {
    next(err);
  }
};

// get single
export const getProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate("category_id", "category_name")
      .populate("brand_id", "brand_name")
      .lean();

    if (!product)
      return res.status(404).json({ message: "Product not found" });

    const variations = await ProductVariation.find({
      product_id: product._id,
    }).lean();

    const variationsWithOptions = await Promise.all(
      variations.map(async (v) => ({
        ...v,
        options: await ProductVariationOption.find({
          product_variation_id: v._id,
        }).lean(),
      }))
    );

    res.json({
      success: true,
      data: {
        ...product,
        category_id: product.category_id?._id || null,
        category_name: product.category_id?.category_name || null,
        brand_id: product.brand_id?._id || null,
        brand_name: product.brand_id?.brand_name || null,
        variations: variationsWithOptions,
      },
    });
  } catch (err) {
    next(err);
  }
};

// update
export const updateProduct = async (req, res, next) => {
  try {
    const id = req.params.id;
    const { product_name, category_id } = req.body;
    let { status } = req.body;

    const existing = await Product.findById(id);
    if (!existing) {
      if (req.file)
        deleteUploadedFile(
          req.file?.path || req.file?.filename || req.file?.location
        );
      return res.status(404).json({ message: "Product not found" });
    }

    // product_name validation if present
    if (typeof product_name !== "undefined") {
      if (!String(product_name).trim()) {
        if (req.file)
          deleteUploadedFile(
            req.file?.path || req.file?.filename || req.file?.location
          );
        return res
          .status(400)
          .json({ message: "product_name cannot be empty" });
      }
      existing.product_name = product_name.trim();
    }

    // category_id validation if present
    if (typeof category_id !== "undefined") {
      if (!String(category_id).trim()) {
        if (req.file)
          deleteUploadedFile(
            req.file?.path || req.file?.filename || req.file?.location
          );
        return res.status(400).json({ message: "category_id cannot be empty" });
      }
      const cat = await ProductCategory.findById(category_id);
      if (!cat) {
        if (req.file)
          deleteUploadedFile(
            req.file?.path || req.file?.filename || req.file?.location
          );
        return res.status(400).json({ message: "Invalid category_id" });
      }
      existing.category_id = category_id;
    }

    // status if present (if not present, keep existing)
    if (typeof status !== "undefined" && status !== null && status !== "") {
      status = Number(status);
      if (![0, 1].includes(status)) {
        if (req.file)
          deleteUploadedFile(
            req.file?.path || req.file?.filename || req.file?.location
          );
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
    if (req.file)
      deleteUploadedFile(
        req.file?.path || req.file?.filename || req.file?.location
      );
    next(err);
  }
};

// delete
export const deleteProduct = async (req, res, next) => {
  try {
    const id = req.params.id;
    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Delete product image if exists
    if (product.product_image) {
      deleteUploadedFile(product.product_image);
    }

    // Find variations of this product
    const variations = await ProductVariation.find({ product_id: id }).select("_id");

    // Collect variation IDs
    const variationIds = variations.map((v) => v._id);

    // Delete all variation options linked to these variations
    await ProductVariationOption.deleteMany({
      product_variation_id: { $in: variationIds },
    });

    //  Delete all configurations linked to this product
    await ProductVariationConfiguration.deleteMany({
      product_id: id,
    });

    //  Delete all variations linked to this product
    await ProductVariation.deleteMany({ product_id: id });

    //  Finally delete the product itself
    await Product.deleteOne({ _id: id });

    res.json({
      message: "Product and related data deleted successfully",
      deleted_product_id: id,
    });
  } catch (err) {
    next(err);
  }
};