import mongoose from "mongoose";
import ProductSku from "../models/product_sku.model.js";
import Product from "../models/product.model.js";
import ProductVariation from "../models/product_variation.model.js";
import ProductVariationOption from "../models/product_variation_options.model.js";
import ProductVariationConfiguration from "../models/product_varition_conf.model.js";
import deleteFile from "../utils/deleteFile.js";
import fs from "fs";
import path from "path";

const buildFileUrl = (filename, folder = "sku") => {
  if (!filename) return null;
  const serverUrl = process.env.SERVER_URL || "";
  return `${serverUrl.replace(/\/$/, "")}/uploads/${folder}/${filename}`;
};

// sku create with variation
export const createProductSkuWithVariation = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // ✅ Ensure upload directory exists (fix for ENOENT error)
    const uploadPath = path.join("uploads", "sku");
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }

    const {
      product_id,
      sku,
      product_sku_name,
      description,
      mrp,
      price,
      quantity,
      is_new,
      single_order_limit,
      is_out_of_stock,
      status,
    } = req.body;

    // ----------------------------------------
    // 🔹 Step 1: Handle variation_option_ids
    // ----------------------------------------
    let variationOptionIds = [];

    for (const key of Object.keys(req.body)) {
      const match = key.match(/^sku_variation_conf\[\d+\]\[variation_option_id\]$/);
      if (match) {
        const val = req.body[key];
        if (val && typeof val === "string" && val.trim()) variationOptionIds.push(val.trim());
      }
    }

    if (Array.isArray(req.body.sku_variation_conf)) {
      variationOptionIds.push(...req.body.sku_variation_conf);
    } else if (typeof req.body.sku_variation_conf === "string") {
      try {
        const parsed = JSON.parse(req.body.sku_variation_conf);
        if (Array.isArray(parsed)) variationOptionIds.push(...parsed);
      } catch {
        if (req.body.sku_variation_conf.includes(",")) {
          variationOptionIds.push(...req.body.sku_variation_conf.split(",").map((v) => v.trim()));
        } else if (req.body.sku_variation_conf.trim()) {
          variationOptionIds.push(req.body.sku_variation_conf.trim());
        }
      }
    } else if (
      typeof req.body.sku_variation_conf === "object" &&
      req.body.sku_variation_conf.variation_option_id
    ) {
      variationOptionIds.push(...req.body.sku_variation_conf.variation_option_id);
    }

    variationOptionIds = [...new Set(variationOptionIds.filter((v) => v && v.length > 10))];

    // ----------------------------------------
    // 🔹 Step 2: Validation
    // ----------------------------------------
    if (!product_id || !sku || !product_sku_name) {
      return res.status(400).json({ message: "product_id, sku, and product_sku_name are required" });
    }

    if (!mongoose.Types.ObjectId.isValid(product_id)) {
      return res.status(400).json({ message: "Invalid product_id format" });
    }

    const productExists = await Product.findById(product_id).session(session);
    if (!productExists) {
      return res.status(400).json({ message: "Product not found" });
    }

    const existingSKU = await ProductSku.findOne({ sku, product_id }).session(session);
    if (existingSKU) {
      return res.status(400).json({ message: "SKU already exists" });
    }

    if (variationOptionIds.length === 0) {
      return res.status(400).json({ message: "At least one variation_option_id is required" });
    }

    // ----------------------------------------
    // 🔹 Step 3: Validate variation options
    // ----------------------------------------
    const validVariationIds = variationOptionIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (validVariationIds.length !== variationOptionIds.length) {
      throw new Error("One or more variation_option_id values are invalid");
    }

    const variationConfigs = await Promise.all(
      validVariationIds.map(async (id) => {
        const option = await ProductVariationOption.findById(id)
          .populate({
            path: "product_variation_id",
            populate: { path: "product_id" },
          })
          .session(session);

        if (!option) throw new Error(`Invalid variation_option_id: ${id}`);

        if (
          !option.product_variation_id ||
          !option.product_variation_id.product_id ||
          String(option.product_variation_id.product_id._id) !== String(product_id)
        ) {
          throw new Error(`Variation option ${id} does not belong to product ${product_id}`);
        }

        return {
          product_id,
          product_variation_option_id: option._id,
          product_variation_id: option.product_variation_id._id,
        };
      })
    );

    const variationIds = variationConfigs.map((vc) => String(vc.product_variation_id));
    const uniqueVarIds = [...new Set(variationIds)];
    if (variationIds.length !== uniqueVarIds.length) {
      throw new Error("Each variation option must belong to a different variation type");
    }

    // ----------------------------------------
    // 🔹 Step 4: Duplicate check
    // ----------------------------------------
    const duplicateCheck = await ProductVariationConfiguration.aggregate([
      {
        $match: {
          product_id: new mongoose.Types.ObjectId(product_id),
          product_variation_option_id: {
            $in: validVariationIds.map((id) => new mongoose.Types.ObjectId(id)),
          },
        },
      },
      {
        $group: {
          _id: "$product_sku_id",
          options: { $addToSet: "$product_variation_option_id" },
        },
      },
      {
        $match: {
          options: {
            $all: validVariationIds.map((id) => new mongoose.Types.ObjectId(id)),
          },
        },
      },
    ]);

    if (duplicateCheck.length > 0) {
      throw new Error("SKU with the same variation configuration already exists");
    }

    // ----------------------------------------
    // 🔹 Step 5: Handle images
    // ----------------------------------------
    const thumbnailFile = req.files?.thumbnail_image?.[0];
    const skuImages = req.files?.sku_image || [];

    // ✅ Check at least one sku_image
    if (!skuImages.length) {
      if (thumbnailFile) deleteFile(thumbnailFile.path || thumbnailFile.filename);
      return res.status(400).json({ message: "At least one sku_image is required" });
    }

    const thumbnailUrl = thumbnailFile ? buildFileUrl(thumbnailFile.filename, "sku") : null;
    const skuImageUrls = skuImages.map((file) => buildFileUrl(file.filename, "sku"));

    // ----------------------------------------
    // 🔹 Step 6: Create SKU
    // ----------------------------------------
    const skuDoc = await ProductSku.create(
      [
        {
          product_id,
          sku,
          product_sku_name,
          description,
          thumbnail_image: thumbnailUrl,
          sku_image: skuImageUrls, // ✅ Save all uploaded images
          mrp: mrp || 0,
          price: price || 0,
          quantity: quantity || 0,
          is_new: is_new === "true" || is_new === true,
          single_order_limit: single_order_limit || 0,
          is_out_of_stock: is_out_of_stock === "true" || is_out_of_stock === true,
          status: status ? Number(status) : 1,
        },
      ],
      { session }
    );

    const skuId = skuDoc[0]._id;

    // ----------------------------------------
    // 🔹 Step 7: Save variation configurations
    // ----------------------------------------
    const confDocs = await ProductVariationConfiguration.insertMany(
      variationConfigs.map((vc) => ({
        ...vc,
        product_sku_id: skuId,
        status: 1,
      })),
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({
      message: "✅ Product SKU with variations created successfully",
      data: {
        sku_id: skuId,
        sku_name: product_sku_name,
        thumbnail_image: thumbnailUrl,
        sku_images: skuImageUrls,
        variation_configurations: confDocs.map((c) => ({
          id: c._id,
          variation_id: c.product_variation_id,
          variation_option_id: c.product_variation_option_id,
        })),
      },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    // Clean up uploaded files on failure
    if (req.files) {
      if (req.files.thumbnail_image?.[0]) deleteFile(req.files.thumbnail_image[0].path);
      if (req.files.sku_image?.length) {
        req.files.sku_image.forEach((file) => deleteFile(file.path));
      }
    }

    console.error("❌ Error creating SKU with variation:", error);
    return res.status(500).json({ message: error.message });
  }
};

// update with variation
export const updateProductSkuWithVariation = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const skuId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(skuId)) {
      return res.status(400).json({ message: "Invalid SKU ID format" });
    }

    const existingSku = await ProductSku.findById(skuId).session(session);
    if (!existingSku) {
      return res.status(404).json({ message: "SKU not found" });
    }

    const {
      product_id,
      sku,
      product_sku_name,
      description,
      mrp,
      price,
      quantity,
      is_new,
      single_order_limit,
      is_out_of_stock,
      status,
    } = req.body;

    // -----------------------------------------------------
    // 🔹 Step 1: Collect variation_option_ids safely
    // -----------------------------------------------------
    let variationOptionIds = [];

    for (const key of Object.keys(req.body)) {
      const match = key.match(/^sku_variation_conf\[\d+\]\[variation_option_id\]$/);
      if (match) {
        const val = req.body[key];
        if (val && typeof val === "string" && val.trim()) variationOptionIds.push(val.trim());
      }
    }

    if (Array.isArray(req.body.sku_variation_conf)) {
      variationOptionIds.push(...req.body.sku_variation_conf);
    } else if (typeof req.body.sku_variation_conf === "string") {
      try {
        const parsed = JSON.parse(req.body.sku_variation_conf);
        if (Array.isArray(parsed)) variationOptionIds.push(...parsed);
      } catch {
        if (req.body.sku_variation_conf.includes(",")) {
          variationOptionIds.push(...req.body.sku_variation_conf.split(",").map((v) => v.trim()));
        } else if (req.body.sku_variation_conf.trim()) {
          variationOptionIds.push(req.body.sku_variation_conf.trim());
        }
      }
    }

    variationOptionIds = [...new Set(variationOptionIds.filter((v) => v && v.length > 10))];

    // -----------------------------------------------------
    // 🔹 Step 2: Validation
    // -----------------------------------------------------
    if (!product_id || !sku || !product_sku_name) {
      return res
        .status(400)
        .json({ message: "product_id, sku, and product_sku_name are required" });
    }

    if (!mongoose.Types.ObjectId.isValid(product_id)) {
      return res.status(400).json({ message: "Invalid product_id format" });
    }

    const productExists = await Product.findById(product_id).session(session);
    if (!productExists) {
      return res.status(400).json({ message: "Product not found" });
    }

    if (variationOptionIds.length === 0) {
      return res
        .status(400)
        .json({ message: "At least one variation_option_id is required" });
    }

    // -----------------------------------------------------
    // 🔹 Step 3: Validate variation options
    // -----------------------------------------------------
    const variationConfigs = await Promise.all(
      variationOptionIds.map(async (id) => {
        const option = await ProductVariationOption.findById(id)
          .populate({
            path: "product_variation_id",
            populate: { path: "product_id" },
          })
          .session(session);

        if (!option) throw new Error(`Invalid variation_option_id: ${id}`);

        if (
          !option.product_variation_id ||
          !option.product_variation_id.product_id ||
          String(option.product_variation_id.product_id._id) !== String(product_id)
        ) {
          throw new Error(
            `Variation option ${id} does not belong to product ${product_id}`
          );
        }

        return {
          product_id,
          product_variation_option_id: option._id,
          product_variation_id: option.product_variation_id._id,
        };
      })
    );

    // -----------------------------------------------------
    // 🔹 Step 4: Handle images (thumbnail + sku_image)
    // -----------------------------------------------------
    const thumbnailFile = req.files?.thumbnail_image?.[0];
    const newSkuImages = req.files?.sku_image || [];

    // ✅ Handle thumbnail update
    if (thumbnailFile) {
      if (existingSku.thumbnail_image) {
        deleteFile(existingSku.thumbnail_image); // ✅ updated (pass full URL directly)
      }
      existingSku.thumbnail_image = buildFileUrl(thumbnailFile.filename, "sku");
    }

    // ✅ Handle sku_image update
    if (newSkuImages.length > 0) {
      // Delete old sku images
      if (existingSku.sku_image?.length) {
        existingSku.sku_image.forEach((img) => {
          deleteFile(img); // ✅ updated (pass full URL directly)
        });
      }
      existingSku.sku_image = newSkuImages.map((file) => buildFileUrl(file.filename, "sku"));
    }

    // ✅ Ensure at least one sku_image exists
    if (!existingSku.sku_image || existingSku.sku_image.length === 0) {
      return res.status(400).json({ message: "At least one sku_image is required" });
    }

    // -----------------------------------------------------
    // 🔹 Step 5: Update SKU info
    // -----------------------------------------------------
    Object.assign(existingSku, {
      product_id,
      sku,
      product_sku_name,
      description,
      mrp,
      price,
      quantity,
      is_new: is_new === "true" || is_new === true,
      single_order_limit: single_order_limit || 0,
      is_out_of_stock: is_out_of_stock === "true" || is_out_of_stock === true,
      status: status ? Number(status) : existingSku.status,
    });

    await existingSku.save({ session });

    // -----------------------------------------------------
    // 🔹 Step 6: Replace variation configurations
    // -----------------------------------------------------
    await ProductVariationConfiguration.deleteMany({
      product_sku_id: existingSku._id,
    }).session(session);

    const confDocs = await ProductVariationConfiguration.insertMany(
      variationConfigs.map((vc) => ({
        ...vc,
        product_sku_id: existingSku._id,
        status: 1,
      })),
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      message: "✅ Product SKU with variations updated successfully",
      data: {
        sku_id: existingSku._id,
        sku_name: existingSku.product_sku_name,
        thumbnail_image: existingSku.thumbnail_image,
        sku_images: existingSku.sku_image,
        variation_configurations: confDocs.map((c) => ({
          id: c._id,
          variation_id: c.product_variation_id,
          variation_option_id: c.product_variation_option_id,
        })),
      },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    // Cleanup on error
    if (req.files) {
      if (req.files.thumbnail_image?.[0])
        deleteFile(req.files.thumbnail_image[0].path);
      if (req.files.sku_image?.length)
        req.files.sku_image.forEach((file) => deleteFile(file.path));
    }

    console.error("❌ Error updating SKU with variation:", error);
    return res.status(500).json({ message: error.message });
  }
};

// Create new Product SKU
export const createProductSku = async (req, res) => {
  try {
    const {
      sku,
      product_sku_name,
      description,
      mrp,
      price,
      quantity,
      is_new,
      single_order_limit,
      is_out_of_stock,
      product_id,
      status,
    } = req.body;

    if (!product_sku_name || !mrp || !price || !quantity || !product_id) {
      return res
        .status(400)
        .json({ message: "Required fields missing (name, mrp, price, quantity, product_id)" });
    }

    const product = await Product.findById(product_id);
    if (!product) {
      return res.status(400).json({ message: "Invalid product_id" });
    }

    const existingSku = await ProductSku.findOne({ sku });
    if (existingSku) {
      return res.status(400).json({ message: "SKU already exists" });
    }

    // Validate status
    let finalStatus = 1;
    if (status !== undefined) {
      if (status === "0" || status === 0) finalStatus = 0;
      else if (status === "1" || status === 1) finalStatus = 1;
      else return res.status(400).json({ message: "Invalid status value" });
    }

    const thumbnailPath = req.file
      ? `${process.env.SERVER_URL}/uploads/product_sku/${req.file.filename}`
      : null;

    const newSku = new ProductSku({
      sku,
      product_sku_name,
      description,
      thumbnail_image: thumbnailPath,
      mrp,
      price,
      quantity,
      is_new,
      single_order_limit,
      is_out_of_stock,
      product_id,
      status: finalStatus,
    });

    await newSku.save();
    res.status(201).json({ message: "Product SKU created successfully", data: newSku });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get all Product SKUs with pagination & filters
export const getAllProductSkus = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "", status, product_id } = req.query;
    const query = {};

    if (search) {
      query.$or = [{ product_sku_name: { $regex: search, $options: "i" } }];
    }
    if (status !== undefined) query.status = Number(status);
    if (product_id) query.product_id = product_id;

    const total = await ProductSku.countDocuments(query);
    const skus = await ProductSku.find(query)
      .populate("product_id", "product_name")
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .sort({ created_at: -1 });

    res.status(200).json({
      total,
      page: Number(page),
      limit: Number(limit),
      data: skus,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get single Product SKU
export const getSingleProductSku = async (req, res) => {
  try {
    const skuId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(skuId)) {
      return res.status(400).json({ message: "Invalid SKU ID format" });
    }

    // Step 1️⃣ — Get SKU base details
    const sku = await ProductSku.findById(skuId)
      .populate("product_id", "product_name")
      .lean();

    if (!sku) {
      return res.status(404).json({ message: "Product SKU not found" });
    }

    // Step 2️⃣ — Get variation configuration details
    const variationConfigs = await ProductVariationConfiguration.find({
      product_sku_id: skuId,
    })
      .populate({
        path: "product_variation_id",
        select: "name", // Variation (e.g., Color, Size)
      })
      .populate({
        path: "product_variation_option_id",
        select: "name", // Option (e.g., Silver, 16inch)
      })
      .lean();

    // Step 3️⃣ — Format clean response
    const formattedConfigs = variationConfigs.map((conf) => ({
      variation: {
        _id: conf.product_variation_id?._id,
        name: conf.product_variation_id?.name || null,
      },
      option: {
        _id: conf.product_variation_option_id?._id,
        name: conf.product_variation_option_id?.name || null,
      },
    }));

    // Step 4️⃣ — Combine and send
    res.status(200).json({
      success: true,
      message: "Product SKU fetched successfully",
      data: {
        ...sku,
        variation_configurations: formattedConfigs,
      },
    });
  } catch (error) {
    console.error("❌ Error fetching SKU:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Update Product SKU
export const updateProductSku = async (req, res) => {
  try {
    const sku = await ProductSku.findById(req.params.id);
    if (!sku) return res.status(404).json({ message: "Product SKU not found" });

    const { product_id, status } = req.body;

    if (product_id) {
      const validProduct = await Product.findById(product_id);
      if (!validProduct) {
        return res.status(400).json({ message: "Invalid product_id" });
      }
    }

    if (status !== undefined && ![0, 1, "0", "1"].includes(status)) {
      return res.status(400).json({ message: "Invalid status type" });
    }

    // Handle image replacement
    if (req.file) {
      if (sku.thumbnail_image) {
        await deleteFile(sku.thumbnail_image);
      }
      sku.thumbnail_image = `${process.env.SERVER_URL}/uploads/product_sku/${req.file.filename}`;
    }

    Object.assign(sku, req.body);
    await sku.save();
    res.status(200).json({ message: "Product SKU updated successfully", data: sku });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Delete Product SKU
export const deleteProductSku = async (req, res) => {
  try {
    const sku = await ProductSku.findById(req.params.id);
    if (!sku) return res.status(404).json({ message: "Product SKU not found" });

    // ----------------------------------------
    // 🔹 Step 1: Delete thumbnail image (if exists)
    // ----------------------------------------
    if (sku.thumbnail_image) {
      deleteFile(sku.thumbnail_image); // ✅ pass full URL directly
    }

    // ----------------------------------------
    // 🔹 Step 2: Delete all SKU images (if exist)
    // ----------------------------------------
    if (Array.isArray(sku.sku_image) && sku.sku_image.length > 0) {
      sku.sku_image.forEach((imageUrl) => {
        deleteFile(imageUrl); // ✅ pass full URL directly
      });
    }

    // ----------------------------------------
    // 🔹 Step 3: Delete related variation configurations
    // ----------------------------------------
    await ProductVariationConfiguration.deleteMany({
      product_sku_id: sku._id,
    });

    // ----------------------------------------
    // 🔹 Step 4: Delete SKU document
    // ----------------------------------------
    await sku.deleteOne();

    return res.status(200).json({ message: "✅ Product SKU deleted successfully" });
  } catch (error) {
    console.error("❌ Error deleting product SKU:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

