import ProductSku from "../models/product_sku.model.js";
import Product from "../models/product.model.js";
import deleteFile from "../utils//deleteFile.js";

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
