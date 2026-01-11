import mongoose from "mongoose";
import ProductSubCategory from "../models/subCategory.model.js";
import ProductCategory from "../models/productCategory.model.js";
import { deleteUploadedFile } from "../middlewares/upload.middleware.js";

// helpers
const buildFileUrl = (filename, folder = "sub-category") => {
  if (!filename) return null;
  return `/uploads/${folder}/${filename}`;
};

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// create
export const createSubCategory = async (req, res, next) => {
  try {
    const { sub_category_name, category_id } = req.body;
    let { status } = req.body;

    if (!sub_category_name?.trim()) {
      if (req.file) deleteUploadedFile(req.file.path);
      return res.status(400).json({ message: "sub_category_name is required" });
    }

    if (!mongoose.Types.ObjectId.isValid(category_id)) {
      if (req.file) deleteUploadedFile(req.file.path);
      return res.status(400).json({ message: "Invalid category_id" });
    }

    const categoryExists = await ProductCategory.exists({ _id: category_id });
    if (!categoryExists) {
      if (req.file) deleteUploadedFile(req.file.path);
      return res.status(404).json({ message: "Category not found" });
    }

    const duplicate = await ProductSubCategory.findOne({
      category_id,
      sub_category_name: {
        $regex: `^${escapeRegExp(sub_category_name)}$`,
        $options: "i",
      },
    });

    if (duplicate) {
      if (req.file) deleteUploadedFile(req.file.path);
      return res
        .status(409)
        .json({ message: "Sub category already exists in this category" });
    }

    status =
      status === undefined || status === "" ? 1 : Number(status);

    if (![0, 1].includes(status)) {
      if (req.file) deleteUploadedFile(req.file.path);
      return res.status(400).json({ message: "status must be 0 or 1" });
    }

    const imageUrl = req.file
      ? buildFileUrl(req.file.filename)
      : null;

    const doc = await ProductSubCategory.create({
      sub_category_name: sub_category_name.trim(),
      sub_category_image: imageUrl,
      category_id,
      status,
    });

    res.status(201).json({ message: "Sub category created", data: doc });
  } catch (err) {
    if (req.file) deleteUploadedFile(req.file.path);
    next(err);
  }
};

// list
export const listSubCategories = async (req, res, next) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);
    const skip = (page - 1) * limit;

    const search = req.query.search?.trim();
    const status = req.query.status;
    const category_id = req.query.category_id;

    const filter = {};

    if (search) {
      filter.sub_category_name = {
        $regex: escapeRegExp(search),
        $options: "i",
      };
    }

    if (status !== undefined) {
      const s = Number(status);
      if (![0, 1].includes(s)) {
        return res.status(400).json({ message: "Invalid status filter" });
      }
      filter.status = s;
    }

    /* ✅ FIX HERE */
    if (category_id) {
      if (!mongoose.Types.ObjectId.isValid(category_id)) {
        return res.status(400).json({ message: "Invalid category_id" });
      }
      filter.category_id = new mongoose.Types.ObjectId(category_id);
    }

    const [total, items] = await Promise.all([
      ProductSubCategory.countDocuments(filter),
      ProductSubCategory.aggregate([
        { $match: filter },
        {
          $lookup: {
            from: "productcategories",
            localField: "category_id",
            foreignField: "_id",
            as: "category",
          },
        },
        { $unwind: "$category" },
        {
          $addFields: {
            category_name: "$category.category_name",
          },
        },
        { $project: { category: 0 } },
        { $sort: { created_at: -1 } },
        { $skip: skip },
        { $limit: limit },
      ]),
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

// get single
export const getSubCategory = async (req, res, next) => {
  try {
    const id = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid id" });

    const data = await ProductSubCategory.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(id) } },
      {
        $lookup: {
          from: "productcategories",
          localField: "category_id",
          foreignField: "_id",
          as: "category",
        },
      },
      { $unwind: "$category" },
      {
        $addFields: {
          category_name: "$category.category_name",
        },
      },
      { $project: { category: 0 } },
    ]);

    if (!data.length)
      return res.status(404).json({ message: "Sub category not found" });

    res.json({ data: data[0] });
  } catch (err) {
    next(err);
  }
};

// update
export const updateSubCategory = async (req, res, next) => {
  try {
    const id = req.params.id;
    const doc = await ProductSubCategory.findById(id);

    if (!doc) {
      if (req.file) deleteUploadedFile(req.file.path);
      return res.status(404).json({ message: "Sub category not found" });
    }

    const { sub_category_name, category_id } = req.body;
    let { status } = req.body;

    if (sub_category_name !== undefined) {
      if (!sub_category_name.trim()) {
        if (req.file) deleteUploadedFile(req.file.path);
        return res
          .status(400)
          .json({ message: "sub_category_name cannot be empty" });
      }

      const duplicate = await ProductSubCategory.findOne({
        _id: { $ne: id },
        category_id: category_id ?? doc.category_id,
        sub_category_name: {
          $regex: `^${escapeRegExp(sub_category_name)}$`,
          $options: "i",
        },
      });

      if (duplicate) {
        if (req.file) deleteUploadedFile(req.file.path);
        return res
          .status(409)
          .json({ message: "Sub category already exists" });
      }

      doc.sub_category_name = sub_category_name.trim();
    }

    if (category_id !== undefined) {
      if (!mongoose.Types.ObjectId.isValid(category_id))
        return res.status(400).json({ message: "Invalid category_id" });

      const categoryExists = await ProductCategory.exists({
        _id: category_id,
      });

      if (!categoryExists)
        return res.status(404).json({ message: "Category not found" });

      doc.category_id = category_id;
    }

    if (status !== undefined && status !== "") {
      status = Number(status);
      if (![0, 1].includes(status))
        return res.status(400).json({ message: "status must be 0 or 1" });
      doc.status = status;
    }

    if (req.file) {
      if (doc.sub_category_image)
        deleteUploadedFile(doc.sub_category_image);
      doc.sub_category_image = buildFileUrl(req.file.filename);
    }

    const updated = await doc.save();
    res.json({ message: "Sub category updated", data: updated });
  } catch (err) {
    if (req.file) deleteUploadedFile(req.file.path);
    next(err);
  }
};

// delete
export const deleteSubCategory = async (req, res, next) => {
  try {
    const doc = await ProductSubCategory.findById(req.params.id);
    if (!doc)
      return res.status(404).json({ message: "Sub category not found" });

    if (doc.sub_category_image)
      deleteUploadedFile(doc.sub_category_image);

    await ProductSubCategory.deleteOne({ _id: doc._id });
    res.json({ message: "Sub category deleted" });
  } catch (err) {
    next(err);
  }
};
