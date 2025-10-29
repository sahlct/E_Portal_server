import ProductCategory from "../models/productCategory.model.js";
import { deleteUploadedFile } from "../middlewares/upload.middleware.js";
import path from "path";
import fs from "fs";

/**
 * Helper to build file URL
 */
const buildFileUrl = (filename, folder = "category") => {
  if (!filename) return null;
  const serverUrl = process.env.SERVER_URL || "";
  // ensure no trailing slash
  return `${serverUrl.replace(/\/$/, "")}/uploads/${folder}/${filename}`;
};

/**
 * escape special regex chars
 */
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* CREATE */
export const createCategory = async (req, res, next) => {
  try {
    const { category_name } = req.body;
    // status optional; will validate below
    let { status } = req.body;

    // validations
    if (!category_name || !String(category_name).trim()) {
      // if multer consumed file, remove it because validation failed
      if (req.file) deleteUploadedFile(req.file.path || req.file.filename || req.file?.location);
      return res.status(400).json({ message: "category_name is required" });
    }

    // check unique (case-insensitive)
    const existing = await ProductCategory.findOne({
      category_name: { $regex: `^${escapeRegExp(category_name)}$`, $options: "i" },
    });
    if (existing) {
      if (req.file) deleteUploadedFile(req.file?.path || req.file?.filename || req.file?.location);
      return res.status(409).json({ message: "category_name already exists" });
    }

    // status handling: if provided, ensure 0 or 1; otherwise default to 1
    if (typeof status === "undefined" || status === null || status === "") {
      status = 1;
    } else {
      status = Number(status);
      if (![0, 1].includes(status)) {
        if (req.file) deleteUploadedFile(req.file?.path || req.file?.filename || req.file?.location);
        return res.status(400).json({ message: "status must be 0 or 1" });
      }
    }

    // handle file: multer stores file in req.file
    let fileUrl = null;
    if (req.file) {
      // req.file.filename is the name we generated in upload middleware
      fileUrl = buildFileUrl(req.file.filename, "category");
    }

    const doc = await ProductCategory.create({
      category_name: category_name.trim(),
      category_image: fileUrl,
      status,
    });

    res.status(201).json({ message: "Category created", data: doc });
  } catch (err) {
    // if multer file present on error, delete it to avoid orphan
    if (req.file) deleteUploadedFile(req.file?.path || req.file?.filename || req.file?.location);
    next(err);
  }
};

/* LIST - pagination + search + status filter */
export const listCategories = async (req, res, next) => {
  try {
    // query params
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100); // default 10, max 100
    const search = req.query.search?.trim();
    const status = typeof req.query.status !== "undefined" ? req.query.status : undefined;

    const filter = {};
    if (search) {
      filter.category_name = { $regex: escapeRegExp(search), $options: "i" };
    }
    if (typeof status !== "undefined") {
      const s = Number(status);
      if (![0, 1].includes(s)) return res.status(400).json({ message: "status filter must be 0 or 1" });
      filter.status = s;
    }

    const skip = (page - 1) * limit;

    const [total, items] = await Promise.all([
      ProductCategory.countDocuments(filter),
      ProductCategory.find(filter)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    res.json({
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit) || 1,
      },
      data: items,
    });
  } catch (err) {
    next(err);
  }
};

/* GET SINGLE */
export const getCategory = async (req, res, next) => {
  try {
    const doc = await ProductCategory.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ message: "Category not found" });
    res.json({ data: doc });
  } catch (err) {
    next(err);
  }
};

/* UPDATE */
export const updateCategory = async (req, res, next) => {
  try {
    const id = req.params.id;
    const { category_name } = req.body;
    let { status } = req.body;

    const existingDoc = await ProductCategory.findById(id);
    if (!existingDoc) {
      if (req.file) deleteUploadedFile(req.file?.path || req.file?.filename || req.file?.location);
      return res.status(404).json({ message: "Category not found" });
    }

    // validate category_name if present
    if (typeof category_name !== "undefined") {
      if (!String(category_name).trim()) {
        if (req.file) deleteUploadedFile(req.file?.path || req.file?.filename || req.file?.location);
        return res.status(400).json({ message: "category_name cannot be empty" });
      }
      // check unique excluding current doc (case-insensitive)
      const found = await ProductCategory.findOne({
        _id: { $ne: existingDoc._id },
        category_name: { $regex: `^${escapeRegExp(category_name)}$`, $options: "i" },
      });
      if (found) {
        if (req.file) deleteUploadedFile(req.file?.path || req.file?.filename || req.file?.location);
        return res.status(409).json({ message: "category_name already exists" });
      }
      existingDoc.category_name = category_name.trim();
    }

    // status handling
    if (typeof status === "undefined" || status === null || status === "") {
      // leave existing value
    } else {
      status = Number(status);
      if (![0, 1].includes(status)) {
        if (req.file) deleteUploadedFile(req.file?.path || req.file?.filename || req.file?.location);
        return res.status(400).json({ message: "status must be 0 or 1" });
      }
      existingDoc.status = status;
    }

    // file handling: if new file uploaded, delete old and set new URL
    if (req.file) {
      // delete old file if exists
      if (existingDoc.category_image) {
        deleteUploadedFile(existingDoc.category_image);
      }
      existingDoc.category_image = buildFileUrl(req.file.filename, "category");
    }

    const updated = await existingDoc.save();
    res.json({ message: "Category updated", data: updated });
  } catch (err) {
    if (req.file) deleteUploadedFile(req.file?.path || req.file?.filename || req.file?.location);
    next(err);
  }
};

/* DELETE */
export const deleteCategory = async (req, res, next) => {
  try {
    const id = req.params.id;
    const doc = await ProductCategory.findById(id);
    if (!doc) return res.status(404).json({ message: "Category not found" });

    // delete file if exists
    if (doc.category_image) {
      deleteUploadedFile(doc.category_image);
    }

    await ProductCategory.deleteOne({ _id: id });
    res.json({ message: "Category deleted" });
  } catch (err) {
    next(err);
  }
};
