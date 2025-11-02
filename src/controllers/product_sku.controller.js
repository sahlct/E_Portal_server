import mongoose from "mongoose";
import ProductSku from "../models/product_sku.model.js";
import Product from "../models/product.model.js";
import ProductVariation from "../models/product_variation.model.js";
import ProductVariationOption from "../models/product_variation_options.model.js";
import ProductVariationConfiguration from "../models/product_varition_conf.model.js";
import deleteFile from "../utils/deleteFile.js";

const buildFileUrl = (filename, folder = "sku") => {
  if (!filename) return null;
  const serverUrl = process.env.SERVER_URL || "";
  return `${serverUrl.replace(/\/$/, "")}/uploads/${folder}/${filename}`;
};

export const createProductSkuWithVariation = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
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
    // 🔹 Step 1: Parse variation_option_ids safely
    // -----------------------------------------------------
    let variationOptionIds = [];

    // Handle form-data fields like sku_variation_conf[0][variation_option_id]
    for (const key of Object.keys(req.body)) {
      const match = key.match(/^sku_variation_conf\[\d+\]\[variation_option_id\]$/);
      if (match) {
        const val = req.body[key];
        if (val && typeof val === "string" && val.trim()) variationOptionIds.push(val.trim());
      }
    }

    // Handle if sku_variation_conf is sent as an array, string, or JSON
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
    } else if (
      typeof req.body.sku_variation_conf === "object" &&
      req.body.sku_variation_conf.variation_option_id
    ) {
      variationOptionIds.push(...req.body.sku_variation_conf.variation_option_id);
    }

    // Clean up duplicates and empty strings
    variationOptionIds = [
      ...new Set(variationOptionIds.filter((v) => v && v.length > 10)),
    ];

    // -----------------------------------------------------
    // 🔹 Step 2: Basic validation
    // -----------------------------------------------------
    if (!product_id || !sku || !product_sku_name) {
      if (req.file) deleteFile(req.file?.path || req.file?.filename);
      return res
        .status(400)
        .json({ message: "product_id, sku, and product_sku_name are required" });
    }

    if (!mongoose.Types.ObjectId.isValid(product_id)) {
      if (req.file) deleteFile(req.file?.path || req.file?.filename);
      return res.status(400).json({ message: "Invalid product_id format" });
    }

    const productExists = await Product.findById(product_id).session(session);
    if (!productExists) {
      if (req.file) deleteFile(req.file?.path || req.file?.filename);
      return res.status(400).json({ message: "Product not found" });
    }

    const existingSKU = await ProductSku.findOne({ sku }).session(session);
    if (existingSKU) {
      if (req.file) deleteFile(req.file?.path || req.file?.filename);
      return res.status(400).json({ message: "SKU already exists" });
    }

    if (variationOptionIds.length === 0) {
      if (req.file) deleteFile(req.file?.path || req.file?.filename);
      return res
        .status(400)
        .json({ message: "At least one variation_option_id is required" });
    }

    // -----------------------------------------------------
    // 🔹 Step 3: Validate all variation option IDs
    // -----------------------------------------------------
    const validVariationIds = variationOptionIds.filter((id) =>
      mongoose.Types.ObjectId.isValid(id)
    );
    if (validVariationIds.length !== variationOptionIds.length) {
      throw new Error("One or more variation_option_id values are invalid");
    }

    // -----------------------------------------------------
    // 🔹 Step 4: Fetch and validate variation options
    // -----------------------------------------------------
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

    // Ensure each variation belongs to a unique variation (e.g., size, color)
    const variationIds = variationConfigs.map((vc) => String(vc.product_variation_id));
    const uniqueVarIds = [...new Set(variationIds)];
    if (variationIds.length !== uniqueVarIds.length) {
      throw new Error("Each variation option must belong to a different variation type");
    }

    // -----------------------------------------------------
    // 🔹 Step 5: Check duplicate SKU configuration
    // -----------------------------------------------------
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

    // -----------------------------------------------------
    // 🔹 Step 6: Handle image file
    // -----------------------------------------------------
    let fileUrl = null;
    if (req.file) fileUrl = buildFileUrl(req.file.filename, "sku");

    // -----------------------------------------------------
    // 🔹 Step 7: Create Product SKU
    // -----------------------------------------------------
    const skuDoc = await ProductSku.create(
      [
        {
          product_id,
          sku,
          product_sku_name,
          description,
          thumbnail_image: fileUrl,
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

    // -----------------------------------------------------
    // 🔹 Step 8: Create Variation Configuration entries
    // -----------------------------------------------------
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
    if (req.file) deleteFile(req.file?.path || req.file?.filename);
    console.error("❌ Error creating SKU with variation:", error);
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
    const sku = await ProductSku.findById(req.params.id).populate("product_id", "product_name");
    if (!sku) return res.status(404).json({ message: "Product SKU not found" });
    res.status(200).json(sku);
  } catch (error) {
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

    if (sku.thumbnail_image) {
      await deleteFile(sku.thumbnail_image);
    }

    await sku.deleteOne();
    res.status(200).json({ message: "Product SKU deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
