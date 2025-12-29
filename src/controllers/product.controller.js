import Product from "../models/product.model.js";
import ProductCategory from "../models/productCategory.model.js";
import ProductVariation from "../models/product_variation.model.js";
import ProductVariationOption from "../models/product_variation_options.model.js";
import ProductVariationConfiguration from "../models/product_varition_conf.model.js";
import ProductSku from "../models/product_sku.model.js";
import Brand from "../models/brands.model.js";
import { deleteUploadedFile } from "../middlewares/upload.middleware.js";
import mongoose from "mongoose";

/* Helpers */
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parseCategoryIds = async (category_id, session) => {
  let categoryIds = [];

  // Parse input
  if (typeof category_id === "string") {
    try {
      categoryIds = JSON.parse(category_id);
    } catch {
      categoryIds = [category_id];
    }
  } else if (Array.isArray(category_id)) {
    categoryIds = category_id;
  }

  if (!Array.isArray(categoryIds) || categoryIds.length === 0) {
    throw new Error("category_id must be a non-empty array");
  }

  // Validate each category ID
  for (const id of categoryIds) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new Error(`Invalid category_id format: ${id}`);
    }

    const exists = await ProductCategory.findById(id).session(session);
    if (!exists) {
      throw new Error(`Category not found: ${id}`);
    }
  }

  return categoryIds;
};

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

    // Parse & Validate CATEGORY IDS (MULTIPLE)
    let categoryIds;

    try {
      categoryIds = await parseCategoryIds(category_id, session);
    } catch (err) {
      if (req.file) deleteUploadedFile(req.file.path || req.file.filename);
      return res.status(400).json({ message: err.message });
    }

    // if (!category_id) {
    //   if (req.file) deleteUploadedFile(req.file.path || req.file.filename);
    //   return res.status(400).json({ message: "category_id is required" });
    // }

    // const categoryExists =
    //   await ProductCategory.findById(category_id).session(session);
    // if (!categoryExists) {
    //   if (req.file) deleteUploadedFile(req.file.path || req.file.filename);
    //   return res.status(400).json({ message: "Invalid category_id" });
    // }

    // Parse FEATURES (optional)
    let features = [];

    if (req.body.features) {
      try {
        if (typeof req.body.features === "string") {
          features = JSON.parse(req.body.features);
        } else if (Array.isArray(req.body.features)) {
          features = req.body.features;
        }

        if (!Array.isArray(features)) {
          throw new Error("Features must be an array");
        }

        features = features.map((f) => {
          if (!f.option || !f.value) {
            throw new Error("Each feature must have option and value");
          }
          return {
            option: String(f.option).trim(),
            value: String(f.value).trim(),
          };
        });
      } catch (err) {
        return res.status(400).json({
          message: "Invalid features format",
          error: err.message,
        });
      }
    }

    // Parse ADVANTAGES (optional)
    let advantages = [];

    if (req.body.advantages) {
      try {
        if (typeof req.body.advantages === "string") {
          advantages = JSON.parse(req.body.advantages);
        } else if (Array.isArray(req.body.advantages)) {
          advantages = req.body.advantages;
        }

        if (!Array.isArray(advantages)) {
          throw new Error("Advantages must be an array");
        }

        advantages = advantages.map((a) => String(a).trim()).filter(Boolean);
      } catch (err) {
        return res.status(400).json({
          message: "Invalid advantages format",
          error: err.message,
        });
      }
    }

    //  BRAND VALIDATION (NULL ALLOWED)
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
      if (![0, 1].includes(status)) throw new Error("status must be 0 or 1");
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
          features,
          advantages,
          category_id: categoryIds,
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

    const existingProduct = await Product.findById(productId).session(session);
    if (!existingProduct) {
      if (req.file) deleteUploadedFile(req.file.path || req.file.filename);
      return res.status(404).json({ message: "Product not found" });
    }

    if (product_name !== undefined)
      existingProduct.product_name = product_name.trim();

    // Update CATEGORY IDS (MULTIPLE)
    if (category_id !== undefined) {
      try {
        const categoryIds = await parseCategoryIds(category_id, session);
        existingProduct.category_id = categoryIds;
      } catch (err) {
        throw new Error(err.message);
      }
    }

    // Parse FEATURES (optional)
    let features = [];

    if (req.body.features) {
      try {
        if (typeof req.body.features === "string") {
          features = JSON.parse(req.body.features);
        } else if (Array.isArray(req.body.features)) {
          features = req.body.features;
        }

        if (!Array.isArray(features)) {
          throw new Error("Features must be an array");
        }

        features = features.map((f) => {
          if (!f.option || !f.value) {
            throw new Error("Each feature must have option and value");
          }
          return {
            option: String(f.option).trim(),
            value: String(f.value).trim(),
          };
        });
      } catch (err) {
        return res.status(400).json({
          message: "Invalid features format",
          error: err.message,
        });
      }
    }

    if (req.body.features !== undefined) {
      existingProduct.features = features;
    }

    // Parse ADVANTAGES (optional)
    let advantages = [];

    if (req.body.advantages) {
      try {
        if (typeof req.body.advantages === "string") {
          advantages = JSON.parse(req.body.advantages);
        } else if (Array.isArray(req.body.advantages)) {
          advantages = req.body.advantages;
        }

        if (!Array.isArray(advantages)) {
          throw new Error("Advantages must be an array");
        }

        advantages = advantages.map((a) => String(a).trim()).filter(Boolean);
      } catch (err) {
        return res.status(400).json({
          message: "Invalid advantages format",
          error: err.message,
        });
      }
    }

    if (req.body.advantages !== undefined) {
      existingProduct.advantages = advantages;
    }

    //  BRAND UPDATE LOGIC
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
      if (![0, 1].includes(status)) throw new Error("status must be 0 or 1");
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

// get similar products
export const getSimilarProducts = async (req, res, next) => {
  try {
    const productId = req.params.id;
    const limit = Math.min(Number(req.query.limit) || 10, 50);

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ message: "Invalid product id" });
    }

    const product = await Product.findById(productId).lean();

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const result = [];
    const addedIds = new Set();

    const baseFilter = {
      _id: { $ne: product._id },
      status: 1,
    };

    // Helper
    const fetchAndAdd = async (filter) => {
      if (result.length >= limit) return;

      const items = await Product.find({
        ...baseFilter,
        ...filter,
        _id: { $nin: Array.from(addedIds) },
      })
        .limit(limit - result.length)
        .populate("brand_id", "brand_name")
        .populate("category_id", "category_name")
        .lean();

      for (const item of items) {
        const id = String(item._id);
        if (!addedIds.has(id)) {
          addedIds.add(id);
          result.push(item);
        }
      }
    };

    //  Same category + same brand
    if (product.category_id?.length && product.brand_id) {
      await fetchAndAdd({
        category_id: { $in: product.category_id },
        brand_id: product.brand_id,
      });
    }

    //  Same category only
    if (product.category_id?.length) {
      await fetchAndAdd({
        category_id: { $in: product.category_id },
      });
    }

    //  Same brand only
    if (product.brand_id) {
      await fetchAndAdd({
        brand_id: product.brand_id,
      });
    }

    //  Fallback
    await fetchAndAdd({});

    //  FETCH ALL SKUs FOR THESE PRODUCTS
    const productIds = result.map((p) => p._id);

    const skus = await ProductSku.find({
      product_id: { $in: productIds },
      status: 1,
    })
      .select("_id product_id product_sku_name")
      .lean();

    // Group SKUs by product_id
    const skuMap = {};
    for (const sku of skus) {
      const pid = String(sku.product_id);
      if (!skuMap[pid]) skuMap[pid] = [];
      skuMap[pid].push({
        _id: sku._id,
        product_sku_name: sku.product_sku_name,
      });
    }

    // Attach SKUs to products
    const finalResult = result.map((p) => ({
      ...p,
      skus: skuMap[String(p._id)] || [],
    }));

    res.json({
      success: true,
      meta: {
        requested_limit: limit,
        returned: finalResult.length,
      },
      data: finalResult,
    });
  } catch (err) {
    next(err);
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

    if (search) {
      filter.product_name = {
        $regex: escapeRegExp(search),
        $options: "i",
      };
    }

    if (status !== undefined) {
      filter.status = Number(status);
    }

    // ✅ FILTER BY CATEGORY (MULTIPLE SUPPORT)
    if (category_id) {
      filter.category_id = { $in: [category_id] };
    }

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

    const formatted = items.map((p) => ({
      ...p,

      // ✅ MULTIPLE CATEGORIES FORMAT
      categories: Array.isArray(p.category_id)
        ? p.category_id.map((c) => ({
            _id: c._id,
            category_name: c.category_name,
          }))
        : [],

      brand_id: p.brand_id?._id || null,
      brand_name: p.brand_id?.brand_name || null,

      // optional cleanup
      category_id: undefined,
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

    // console.log("product", product);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

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

        //  MULTIPLE CATEGORIES FORMAT
        categories: Array.isArray(product.category_id)
          ? product.category_id.map((c) => ({
              _id: c._id,
              category_name: c.category_name,
            }))
          : [],

        brand_id: product.brand_id?._id || null,
        brand_name: product.brand_id?.brand_name || null,

        variations: variationsWithOptions,

        // optional cleanup
        category_id: undefined,
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
    const variations = await ProductVariation.find({ product_id: id }).select(
      "_id"
    );

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
