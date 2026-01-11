import Product from "../models/product.model.js";
import ProductCategory from "../models/productCategory.model.js";
import ProductVariation from "../models/product_variation.model.js";
import ProductVariationOption from "../models/product_variation_options.model.js";
import ProductVariationConfiguration from "../models/product_varition_conf.model.js";
import ProductSubCategory from "../models/subCategory.model.js";
import ProductInnerCategory from "../models/innerCategory.model.js";
import ProductSku from "../models/product_sku.model.js";
import Brand from "../models/brands.model.js";
import { deleteUploadedFile } from "../middlewares/upload.middleware.js";
import mongoose from "mongoose";
import e from "express";

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
    const {
      product_name,
      category_id,
      brand_id,
      sub_category_id,
      inner_category_id,
    } = req.body;
    let { status, variations } = req.body;

    if (typeof variations === "string") {
      variations = JSON.parse(variations);
    }

    if (!product_name?.trim()) {
      if (req.file) deleteUploadedFile(req.file.path || req.file.filename);
      return res.status(400).json({ message: "product_name is required" });
    }

    //  CATEGORY VALIDATION
    if (!mongoose.Types.ObjectId.isValid(category_id)) {
      return res.status(400).json({ message: "Invalid category_id" });
    }

    const category =
      await ProductCategory.findById(category_id).session(session);
    if (!category) {
      return res.status(400).json({ message: "Category not found" });
    }

    // SUB CATEGORY VALIDATION
    if (!mongoose.Types.ObjectId.isValid(sub_category_id)) {
      return res.status(400).json({ message: "Invalid sub_category_id" });
    }

    const subCategory =
      await ProductSubCategory.findById(sub_category_id).session(session);
    if (!subCategory) {
      return res.status(400).json({ message: "Sub category not found" });
    }

    // Ensure sub category belongs to same category
    if (String(subCategory.category_id) !== String(category_id)) {
      return res.status(400).json({
        message: "Sub category does not belong to selected category",
      });
    }

    //  INNER CATEGORY VALIDATION
    if (!mongoose.Types.ObjectId.isValid(inner_category_id)) {
      return res.status(400).json({ message: "Invalid inner_category_id" });
    }

    const innerCategory =
      await ProductInnerCategory.findById(inner_category_id).session(session);

    if (!innerCategory) {
      return res.status(400).json({ message: "Inner category not found" });
    }

    // Ensure inner category belongs to same sub category
    if (String(innerCategory.sub_category_id) !== String(sub_category_id)) {
      return res.status(400).json({
        message: "Inner category does not belong to selected sub category",
      });
    }

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
          category_id,
          sub_category_id,
          inner_category_id,
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
    const {
      product_name,
      category_id,
      brand_id,
      sub_category_id,
      inner_category_id,
    } = req.body;
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

    // CATEGORY / SUB / INNER VALIDATION

    // Resolve final IDs (new or existing)
    const finalCategoryId = category_id ?? existingProduct.category_id;
    const finalSubCategoryId =
      sub_category_id ?? existingProduct.sub_category_id;
    const finalInnerCategoryId =
      inner_category_id ?? existingProduct.inner_category_id;

    // CATEGORY
    if (category_id !== undefined) {
      if (!mongoose.Types.ObjectId.isValid(category_id)) {
        return res.status(400).json({ message: "Invalid category_id" });
      }

      const category =
        await ProductCategory.findById(category_id).session(session);
      if (!category) {
        return res.status(400).json({ message: "Category not found" });
      }

      existingProduct.category_id = category_id;
    }

    // SUB CATEGORY
    if (sub_category_id !== undefined) {
      if (!mongoose.Types.ObjectId.isValid(sub_category_id)) {
        return res.status(400).json({ message: "Invalid sub_category_id" });
      }

      const subCategory =
        await ProductSubCategory.findById(sub_category_id).session(session);

      if (!subCategory) {
        return res.status(400).json({ message: "Sub category not found" });
      }

      if (String(subCategory.category_id) !== String(finalCategoryId)) {
        return res.status(400).json({
          message: "Sub category does not belong to selected category",
        });
      }

      existingProduct.sub_category_id = sub_category_id;
    }

    // INNER CATEGORY
    if (inner_category_id !== undefined) {
      if (!mongoose.Types.ObjectId.isValid(inner_category_id)) {
        return res.status(400).json({ message: "Invalid inner_category_id" });
      }

      const innerCategory =
        await ProductInnerCategory.findById(inner_category_id).session(session);

      if (!innerCategory) {
        return res.status(400).json({ message: "Inner category not found" });
      }

      if (
        String(innerCategory.sub_category_id) !== String(finalSubCategoryId)
      ) {
        return res.status(400).json({
          message: "Inner category does not belong to selected sub category",
        });
      }

      existingProduct.inner_category_id = inner_category_id;
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

    const buildPipeline = (matchStage) => [
      { $match: matchStage },

      // 🔥 JOIN SKUs
      {
        $lookup: {
          from: "productskus",
          let: { pid: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$product_id", "$$pid"] },
                    { $eq: ["$status", 1] },
                  ],
                },
              },
            },
            {
              $project: {
                _id: 1,
                product_sku_name: 1,
                sku: 1,
              },
            },
          ],
          as: "skus",
        },
      },

      // ✅ REMOVE PRODUCTS WITHOUT SKUS
      { $match: { "skus.0": { $exists: true } } },

      // populate brand
      {
        $lookup: {
          from: "brands",
          localField: "brand_id",
          foreignField: "_id",
          as: "brand_id",
        },
      },
      { $unwind: { path: "$brand_id", preserveNullAndEmptyArrays: true } },

      // populate category
      {
        $lookup: {
          from: "categories",
          localField: "category_id",
          foreignField: "_id",
          as: "category_id",
        },
      },

      { $limit: limit },
    ];

    let data = [];

    // 1️⃣ Same category + brand
    if (product.category_id?.length && product.brand_id) {
      data = await Product.aggregate(
        buildPipeline({
          _id: { $ne: product._id },
          status: 1,
          brand_id: product.brand_id,
          category_id: { $in: product.category_id },
        })
      );
    }

    // 2️⃣ Same category
    if (data.length < limit && product.category_id?.length) {
      const more = await Product.aggregate(
        buildPipeline({
          _id: { $ne: product._id, $nin: data.map((d) => d._id) },
          status: 1,
          category_id: { $in: product.category_id },
        })
      );
      data.push(...more);
    }

    // 3️⃣ Same brand
    if (data.length < limit && product.brand_id) {
      const more = await Product.aggregate(
        buildPipeline({
          _id: { $ne: product._id, $nin: data.map((d) => d._id) },
          status: 1,
          brand_id: product.brand_id,
        })
      );
      data.push(...more);
    }

    // 4️⃣ Fallback
    if (data.length < limit) {
      const more = await Product.aggregate(
        buildPipeline({
          _id: { $ne: product._id, $nin: data.map((d) => d._id) },
          status: 1,
        })
      );
      data.push(...more);
    }

    const finalData = data.slice(0, limit);

    res.json({
      success: true,
      meta: {
        requested_limit: limit,
        returned: finalData.length,
      },
      data: finalData,
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
    const skip = (page - 1) * limit;

    const search = req.query.search?.trim();
    const status = req.query.status;
    const category_id = req.query.category_id?.trim();
    const sub_category_id = req.query.sub_category_id?.trim();
    const inner_category_id = req.query.inner_category_id?.trim();

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

    if (category_id) {
      if (!mongoose.Types.ObjectId.isValid(category_id)) {
        return res.status(400).json({ message: "Invalid category_id" });
      }
      filter.category_id = category_id;
    }

    if (sub_category_id) {
      if (!mongoose.Types.ObjectId.isValid(sub_category_id)) {
        return res.status(400).json({ message: "Invalid sub_category_id" });
      }
      filter.sub_category_id = sub_category_id;
    }

    if (inner_category_id) {
      if (!mongoose.Types.ObjectId.isValid(inner_category_id)) {
        return res.status(400).json({ message: "Invalid inner_category_id" });
      }
      filter.inner_category_id = inner_category_id;
    }

    const [total, items] = await Promise.all([
      Product.countDocuments(filter),
      Product.find(filter)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .populate("category_id", "category_name")
        .populate("sub_category_id", "sub_category_name")
        .populate("inner_category_id", "inner_category_name")
        .populate("brand_id", "brand_name")
        .lean(),
    ]);

    const formatted = items.map((p) => ({
      _id: p._id,
      product_name: p.product_name,
      product_image: p.product_image,

      /* CATEGORY */
      category_id: p.category_id?._id || null,
      category_name: p.category_id?.category_name || null,

      /* SUB CATEGORY */
      sub_category_id: p.sub_category_id?._id || null,
      sub_category_name: p.sub_category_id?.sub_category_name || null,

      /* INNER CATEGORY */
      inner_category_id: p.inner_category_id?._id || null,
      inner_category_name: p.inner_category_id?.inner_category_name || null,

      /* BRAND */
      brand_id: p.brand_id?._id || null,
      brand_name: p.brand_id?.brand_name || null,

      status: p.status,
      created_at: p.created_at,
      updated_at: p.updated_at,
    }));

    res.json({
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit) || 1,
      },
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
      .populate("sub_category_id", "sub_category_name")
      .populate("inner_category_id", "inner_category_name")
      .populate("brand_id", "brand_name")
      .lean();

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // VARIATIONS
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
        _id: product._id,
        product_name: product.product_name,
        product_image: product.product_image,

        /* CATEGORY */
        category_id: product.category_id?._id || null,
        category_name: product.category_id?.category_name || null,

        /* SUB CATEGORY */
        sub_category_id: product.sub_category_id?._id || null,
        sub_category_name: product.sub_category_id?.sub_category_name || null,

        /* INNER CATEGORY */
        inner_category_id: product.inner_category_id?._id || null,
        inner_category_name:
          product.inner_category_id?.inner_category_name || null,

        /* BRAND */
        brand_id: product.brand_id?._id || null,
        brand_name: product.brand_id?.brand_name || null,

        /* FEATURES */
        features: product.features || [],
        advantages: product.advantages || [],

        /* VARIATIONS */
        variations: variationsWithOptions,

        status: product.status,
        created_at: product.created_at,
        updated_at: product.updated_at,
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
