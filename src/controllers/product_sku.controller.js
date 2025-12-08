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
  return `/uploads/${folder}/${filename}`;
};

// sku create with variation
export const createProductSkuWithVariation = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // -----------------------------------------
    // Ensure upload folder exists
    // -----------------------------------------
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

    // -----------------------------------------
    // Validate required fields
    // -----------------------------------------
    if (!product_id || !sku || !product_sku_name) {
      return res.status(400).json({
        message: "product_id, sku, and product_sku_name are required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(product_id)) {
      return res.status(400).json({ message: "Invalid product_id format" });
    }

    // -----------------------------------------
    // Verify product exists
    // -----------------------------------------
    const productExists = await Product.findById(product_id).session(session);
    if (!productExists) {
      return res.status(400).json({ message: "Product not found" });
    }

    // -----------------------------------------
    // Check duplicate SKU for this product
    // -----------------------------------------
    const existingSKU = await ProductSku.findOne({ product_id, sku }).session(
      session
    );
    if (existingSKU) {
      return res.status(400).json({ message: "SKU already exists" });
    }

    // -----------------------------------------
    // Check whether product has variation definitions
    // -----------------------------------------
    const productHasVariations = await ProductVariation.countDocuments({
      product_id,
    }).session(session);

    // -----------------------------------------
    // Collect variation_option_ids from request
    // -----------------------------------------
    let variationOptionIds = [];

    for (const key of Object.keys(req.body)) {
      const match = key.match(
        /^sku_variation_conf\[\d+\]\[variation_option_id\]$/
      );
      if (match) {
        const val = req.body[key];
        if (val && typeof val === "string" && val.trim())
          variationOptionIds.push(val.trim());
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
          variationOptionIds.push(
            ...req.body.sku_variation_conf.split(",").map((v) => v.trim())
          );
        } else if (req.body.sku_variation_conf.trim()) {
          variationOptionIds.push(req.body.sku_variation_conf.trim());
        }
      }
    }

    variationOptionIds = [
      ...new Set(variationOptionIds.filter((v) => v && v.length > 10)),
    ];

    // ============================================================
    // 🔥 CASE 1: Product HAS variations → variation options REQUIRED
    // ============================================================
    if (productHasVariations > 0) {
      if (variationOptionIds.length === 0) {
        return res.status(400).json({
          message: "At least one variation_option_id is required",
        });
      }
    }

    // ============================================================
    // 🔥 CASE 2: Product has NO variations → allow ONLY ONE SKU
    // ============================================================
    if (productHasVariations === 0) {
      const skuCount = await ProductSku.countDocuments({ product_id }).session(
        session
      );

      if (skuCount >= 1) {
        return res.status(400).json({
          message:
            "This product does not have variations and can only have one SKU",
        });
      }
    }

    // -----------------------------------------
    // Validate variation options if provided
    // -----------------------------------------
    if (variationOptionIds.length > 0) {
      const validVariationIds = variationOptionIds.filter((id) =>
        mongoose.Types.ObjectId.isValid(id)
      );

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

          // ensure variation option belongs to same product
          if (
            !option.product_variation_id ||
            !option.product_variation_id.product_id ||
            String(option.product_variation_id.product_id._id) !==
              String(product_id)
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

      const variationIds = variationConfigs.map((vc) =>
        String(vc.product_variation_id)
      );
      const uniqueVarIds = [...new Set(variationIds)];

      // Each option must belong to different variation
      if (variationIds.length !== uniqueVarIds.length) {
        throw new Error(
          "Each variation option must belong to a different variation type"
        );
      }

      // Duplicate SKU check
      const duplicateCheck = await ProductVariationConfiguration.aggregate([
        {
          $match: {
            product_id: new mongoose.Types.ObjectId(product_id),
            product_variation_option_id: {
              $in: validVariationIds.map(
                (id) => new mongoose.Types.ObjectId(id)
              ),
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
              $all: validVariationIds.map(
                (id) => new mongoose.Types.ObjectId(id)
              ),
            },
          },
        },
      ]);

      if (duplicateCheck.length > 0) {
        throw new Error(
          "SKU with the same variation configuration already exists"
        );
      }
    }

    // -----------------------------------------
    // Upload images
    // -----------------------------------------
    const thumbnailFile = req.files?.thumbnail_image?.[0];
    const skuImages = req.files?.sku_image || [];

    if (!skuImages.length) {
      if (thumbnailFile) deleteFile(thumbnailFile.path);
      return res
        .status(400)
        .json({ message: "At least one sku_image is required" });
    }

    const thumbnailUrl = thumbnailFile
      ? buildFileUrl(thumbnailFile.filename, "sku")
      : null;

    const skuImageUrls = skuImages.map((file) =>
      buildFileUrl(file.filename, "sku")
    );

    // -----------------------------------------
    // Create SKU
    // -----------------------------------------
    const skuDoc = await ProductSku.create(
      [
        {
          product_id,
          sku,
          product_sku_name,
          description,
          thumbnail_image: thumbnailUrl,
          sku_image: skuImageUrls,
          mrp: mrp || 0,
          price: price || 0,
          quantity: quantity || 0,
          is_new: is_new === "true" || is_new === true,
          single_order_limit: single_order_limit || 0,
          is_out_of_stock:
            is_out_of_stock === "true" || is_out_of_stock === true,
          status: status ? Number(status) : 1,
        },
      ],
      { session }
    );

    const skuId = skuDoc[0]._id;

    // -----------------------------------------
    // Save variation configurations (if provided)
    // -----------------------------------------
    if (variationOptionIds.length > 0) {
      const variationConfigs = variationOptionIds.map((id) => ({
        product_id,
        product_sku_id: skuId,
        product_variation_option_id: id,
        status: 1,
      }));

      await ProductVariationConfiguration.insertMany(variationConfigs, {
        session,
      });
    }

    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({
      message: "Product SKU with variations created successfully",
      data: {
        sku_id: skuId,
        product_sku_name,
        thumbnail_image: thumbnailUrl,
        sku_images: skuImageUrls,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    // Delete uploaded files on failure
    if (req.files) {
      if (req.files.thumbnail_image?.[0])
        deleteFile(req.files.thumbnail_image[0].path);

      if (req.files.sku_image?.length) {
        req.files.sku_image.forEach((file) => deleteFile(file.path));
      }
    }

    console.error("Error creating SKU with variation:", error);
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

    /*-----------------------------------------
      STEP 1: Read Variation Option IDs
    -----------------------------------------*/
    let variationOptionIds = [];

    for (const key of Object.keys(req.body)) {
      const match = key.match(/^sku_variation_conf\[\d+\]\[variation_option_id\]$/);
      if (match) {
        const val = req.body[key];
        if (val?.trim()) variationOptionIds.push(val.trim());
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
          variationOptionIds.push(
            ...req.body.sku_variation_conf.split(",").map((v) => v.trim())
          );
        } else variationOptionIds.push(req.body.sku_variation_conf.trim());
      }
    }

    variationOptionIds = [...new Set(variationOptionIds.filter((v) => v.length > 10))];

    /*-----------------------------------------
      VALIDATIONS
    -----------------------------------------*/
    if (!product_id || !sku || !product_sku_name) {
      return res.status(400).json({
        message: "product_id, sku, and product_sku_name are required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(product_id)) {
      return res.status(400).json({ message: "Invalid product_id format" });
    }

    const productExists = await Product.findById(product_id).session(session);
    if (!productExists) {
      return res.status(400).json({ message: "Product not found" });
    }

    const productHasVariations = await ProductVariation.countDocuments({
      product_id,
    }).session(session);

    if (productHasVariations > 0 && variationOptionIds.length === 0) {
      return res.status(400).json({
        message: "At least one variation_option_id is required",
      });
    }

    if (productHasVariations === 0) {
      if (String(existingSku.product_id) !== String(product_id)) {
        const skuCount = await ProductSku.countDocuments({ product_id }).session(session);
        if (skuCount >= 1) {
          return res.status(400).json({
            message: "This product does not have variations and can only have one SKU",
          });
        }
      }
      variationOptionIds = [];
    }

    /*-----------------------------------------
      STEP 4: Validate Variation Options
    -----------------------------------------*/
    let variationConfigs = [];

    if (variationOptionIds.length > 0) {
      variationConfigs = await Promise.all(
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
            throw new Error(`Variation option ${id} does not belong to product ${product_id}`);
          }

          return {
            product_id,
            product_variation_option_id: option._id,
            product_variation_id: option.product_variation_id._id,
          };
        })
      );

      const variationIds = variationConfigs.map((v) => String(v.product_variation_id));
      const uniqueVariationIds = [...new Set(variationIds)];

      if (variationIds.length !== uniqueVariationIds.length) {
        throw new Error("Each variation option must belong to a different variation type");
      }
    }

    /*-----------------------------------------
      STEP 5: HANDLE IMAGES (MERGE LOGIC)
    -----------------------------------------*/

    const thumbnailFile = req.files?.thumbnail_image?.[0];
    const newSkuImages = req.files?.sku_image || [];

    // 5A - Update thumbnail
    if (thumbnailFile) {
      if (existingSku.thumbnail_image) {
        deleteFile(existingSku.thumbnail_image);
      }
      existingSku.thumbnail_image = buildFileUrl(thumbnailFile.filename, "sku");
    }

    // 5B - HANDLE EXISTING + NEW IMAGES MERGE
    let finalImages = [];

    // 5B-1: Keep existing images
    if (Array.isArray(req.body.existing_sku_image)) {
      finalImages = [...req.body.existing_sku_image];
    } else if (req.body.existing_sku_image) {
      finalImages = [req.body.existing_sku_image];
    }

    // 5B-2: Add newly uploaded images
    if (newSkuImages.length > 0) {
      const newImageUrls = newSkuImages.map((file) =>
        buildFileUrl(file.filename, "sku")
      );
      finalImages = [...finalImages, ...newImageUrls];
    }

    if (finalImages.length === 0) {
      return res.status(400).json({ message: "At least one sku_image is required" });
    }

    existingSku.sku_image = finalImages;

    /*-----------------------------------------
      UPDATE SKU FIELDS
    -----------------------------------------*/
    Object.assign(existingSku, {
      product_id,
      sku,
      product_sku_name,
      description,
      mrp,
      price,
      quantity,
      is_new: is_new === "true" || is_new === true,
      single_order_limit,
      is_out_of_stock: is_out_of_stock === "true" || is_out_of_stock === true,
      status: status ? Number(status) : existingSku.status,
    });

    await existingSku.save({ session });

    /*-----------------------------------------
      UPDATE VARIATION CONFIG
    -----------------------------------------*/
    await ProductVariationConfiguration.deleteMany({
      product_sku_id: existingSku._id,
    }).session(session);

    let confDocs = [];

    if (variationConfigs.length > 0) {
      confDocs = await ProductVariationConfiguration.insertMany(
        variationConfigs.map((vc) => ({
          ...vc,
          product_sku_id: existingSku._id,
          status: 1,
        })),
        { session }
      );
    }

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      message: "Product SKU with variations updated successfully",
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

    if (req.files) {
      if (req.files.thumbnail_image?.[0]) deleteFile(req.files.thumbnail_image[0].path);
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
        .json({
          message:
            "Required fields missing (name, mrp, price, quantity, product_id)",
        });
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
    res
      .status(201)
      .json({ message: "Product SKU created successfully", data: newSku });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get all Product SKUs with pagination & filters
export const getAllProductSkus = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      status,
      product_id,
      category_id,
      is_new, // ✅ Added this
    } = req.query;

    const query = {};

    // 🔹 Search by SKU name
    if (search) {
      query.$or = [{ product_sku_name: { $regex: search, $options: "i" } }];
    }

    // 🔹 Filter by status
    if (status !== undefined) query.status = Number(status);

    // 🔹 Filter by product ID (direct)
    if (product_id) query.product_id = product_id;

    // 🔹 Filter by is_new (true / false)
    if (is_new !== undefined) {
      // Convert string to boolean properly
      if (is_new === "true" || is_new === true) query.is_new = true;
      else if (is_new === "false" || is_new === false) query.is_new = false;
    }

    // 🔹 Filter by category ID (indirect — via Product)
    if (category_id) {
      const products = await Product.find({ category_id }).select("_id");
      const productIds = products.map((p) => p._id);

      if (productIds.length > 0) {
        query.product_id = { $in: productIds };
      } else {
        // No products found for that category
        return res.status(200).json({
          total: 0,
          page: Number(page),
          limit: Number(limit),
          data: [],
        });
      }
    }

    // 🔹 Count total
    const total = await ProductSku.countDocuments(query);

    // 🔹 Fetch paginated SKUs
    const skus = await ProductSku.find(query)
      .populate("product_id", "product_name category_id")
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .sort({ created_at: -1 });

    return res.status(200).json({
      total,
      page: Number(page),
      limit: Number(limit),
      data: skus,
    });
  } catch (error) {
    console.error("❌ Error fetching product SKUs:", error);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
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
      .populate("product_id", "product_name",)
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
    res
      .status(200)
      .json({ message: "Product SKU updated successfully", data: sku });
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

    return res
      .status(200)
      .json({ message: "✅ Product SKU deleted successfully" });
  } catch (error) {
    console.error("❌ Error deleting product SKU:", error);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};

export const updateMultipleSkuIsNew = async (req, res) => {
  try {
    const { sku_ids, is_new } = req.body;

    if (!Array.isArray(sku_ids) || typeof is_new !== "boolean") {
      return res.status(400).json({ message: "Invalid request format" });
    }

    const result = await ProductSku.updateMany(
      { _id: { $in: sku_ids } },
      { $set: { is_new } }
    );

    res.status(200).json({
      message: `Successfully updated ${result.modifiedCount} SKUs`,
      updated: result.modifiedCount,
    });
  } catch (error) {
    console.error("❌ Error updating is_new:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const getVariationsByProductId = async (req, res) => {
  try {
    const { id } = req.params; // product_id

    const confs = await ProductVariationConfiguration.find({ product_id: id })
      .populate({
        path: "product_variation_id",
        model: "ProductVariation",
        select: "name product_id",
      })
      .populate({
        path: "product_variation_option_id",
        model: "ProductVariationOption",
        select: "name product_variation_id",
      })
      .populate({
        path: "product_sku_id",
        model: "ProductSku",
        select: "product_sku_name sku",
      })
      .lean();

    if (!confs.length) {
      return res.status(200).json({
        message: "No variation configurations found",
        data: [],
      });
    }

    // ---------------------------------------
    // GROUP BY product_sku_id
    // ---------------------------------------
    const grouped = {};

    confs.forEach((c) => {
      const skuId = String(c.product_sku_id?._id);

      if (!grouped[skuId]) {
        grouped[skuId] = {
          product_sku_id: skuId,
          product_sku_name: c.product_sku_id?.product_sku_name || null,
          sku: c.product_sku_id?.sku || null,
          variations: [],
        };
      }

      grouped[skuId].variations.push({
        conf_id: c._id,
        variation_id: c.product_variation_id?._id || null,
        variation_name: c.product_variation_id?.name || null,
        variation_option_id: c.product_variation_option_id?._id || null,
        variation_option_name: c.product_variation_option_id?.name || null,
        status: c.status,
        created_at: c.created_at,
        updated_at: c.updated_at,
      });
    });

    return res.status(200).json({
      message: "Variations fetched successfully",
      data: Object.values(grouped), // convert object → array
    });

  } catch (error) {
    console.error("❌ Error fetching variations:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
