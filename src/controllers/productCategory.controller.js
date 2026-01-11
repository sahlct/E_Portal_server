import ProductCategory from "../models/productCategory.model.js";
import { deleteUploadedFile } from "../middlewares/upload.middleware.js";

/* Helper URL builder */
const buildFileUrl = (filename, folder = "category") => {
  if (!filename) return null;
  return `/uploads/${folder}/${filename}`;
};

/* Escape regex */
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// CREATE CATEGORY
export const createCategory = async (req, res, next) => {
  try {
    const { category_name } = req.body;
    let { status, is_listing } = req.body;

    if (!category_name?.trim()) {
      if (req.file) deleteUploadedFile(req.file.path);
      return res.status(400).json({ message: "category_name is required" });
    }

    // check duplicate
    const existing = await ProductCategory.findOne({
      category_name: {
        $regex: `^${escapeRegExp(category_name)}$`,
        $options: "i",
      },
    });

    if (existing) {
      if (req.file) deleteUploadedFile(req.file.path);
      return res.status(409).json({ message: "category_name already exists" });
    }

    // validate status
    if (status === undefined || status === null || status === "") status = 1;
    else {
      status = Number(status);
      if (![0, 1].includes(status)) {
        if (req.file) deleteUploadedFile(req.file.path);
        return res.status(400).json({ message: "status must be 0 or 1" });
      }
    }

    // validate is_listing
    is_listing = is_listing === "true" || is_listing === true;

    // LIMIT: MAX 2 categories can be listing
    if (is_listing) {
      const listingCount = await ProductCategory.countDocuments({
        is_listing: true,
      });
      if (listingCount >= 2) {
        if (req.file) deleteUploadedFile(req.file.path);
        return res.status(400).json({
          message: "Only 2 categories can be marked as listing",
        });
      }
    }

    let fileUrl = null;
    if (req.file) fileUrl = buildFileUrl(req.file.filename, "category");

    const doc = await ProductCategory.create({
      category_name: category_name.trim(),
      category_image: fileUrl,
      status,
      is_listing,
    });

    res.status(201).json({ message: "Category created", data: doc });
  } catch (err) {
    if (req.file) deleteUploadedFile(req.file.path);
    next(err);
  }
};

// LIST CATEGORIES
export const listCategories = async (req, res, next) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);

    const search = req.query.search?.trim();
    const status = req.query.status;
    const is_listing = req.query.is_listing;

    const filter = {};

    if (search)
      filter.category_name = { $regex: escapeRegExp(search), $options: "i" };

    if (status !== undefined) {
      const s = Number(status);
      if (![0, 1].includes(s)) {
        return res.status(400).json({ message: "Invalid status filter" });
      }
      filter.status = s;
    }

    // NEW: filter by listing
    if (is_listing !== undefined) {
      filter.is_listing = is_listing === "true";
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

// SINGLE CATEGORY
export const getCategory = async (req, res, next) => {
  try {
    const doc = await ProductCategory.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ message: "Category not found" });
    res.json({ data: doc });
  } catch (err) {
    next(err);
  }
};

// UPDATE CATEGORY
export const updateCategory = async (req, res, next) => {
  try {
    const id = req.params.id;
    const existingDoc = await ProductCategory.findById(id);

    if (!existingDoc) {
      if (req.file) deleteUploadedFile(req.file?.path);
      return res.status(404).json({ message: "Category not found" });
    }

    const { category_name } = req.body;
    let { status, is_listing } = req.body;

    // Update name validation
    if (category_name !== undefined) {
      if (!category_name.trim()) {
        if (req.file) deleteUploadedFile(req.file.path);
        return res
          .status(400)
          .json({ message: "category_name cannot be empty" });
      }

      const duplicate = await ProductCategory.findOne({
        _id: { $ne: id },
        category_name: {
          $regex: `^${escapeRegExp(category_name)}$`,
          $options: "i",
        },
      });

      if (duplicate) {
        if (req.file) deleteUploadedFile(req.file.path);
        return res
          .status(409)
          .json({ message: "category_name already exists" });
      }

      existingDoc.category_name = category_name.trim();
    }

    // status
    if (status !== undefined && status !== null && status !== "") {
      status = Number(status);
      if (![0, 1].includes(status)) {
        if (req.file) deleteUploadedFile(req.file.path);
        return res.status(400).json({ message: "status must be 0 or 1" });
      }
      existingDoc.status = status;
    }

    // NEW: is_listing update logic
    if (is_listing !== undefined) {
      const newListing = is_listing === "true" || is_listing === true;

      if (newListing) {
        const listingCount = await ProductCategory.countDocuments({
          _id: { $ne: id },
          is_listing: true,
        });

        if (listingCount >= 2) {
          if (req.file) deleteUploadedFile(req.file.path);
          return res.status(400).json({
            message: "Only 2 categories can be marked as listing",
          });
        }
      }

      existingDoc.is_listing = newListing;
    }

    // IMAGE update
    if (req.file) {
      if (existingDoc.category_image)
        deleteUploadedFile(existingDoc.category_image);
      existingDoc.category_image = buildFileUrl(req.file.filename, "category");
    }

    const updated = await existingDoc.save();
    res.json({ message: "Category updated", data: updated });
  } catch (err) {
    if (req.file) deleteUploadedFile(req.file.path);
    next(err);
  }
};

// DELETE CATEGORY
export const deleteCategory = async (req, res, next) => {
  try {
    const doc = await ProductCategory.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Category not found" });

    if (doc.category_image) deleteUploadedFile(doc.category_image);

    await ProductCategory.deleteOne({ _id: req.params.id });
    res.json({ message: "Category deleted" });
  } catch (err) {
    next(err);
  }
};
