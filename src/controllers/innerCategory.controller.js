import mongoose from "mongoose";
import ProductInnerCategory from "../models/innerCategory.model.js";
import ProductCategory from "../models/productCategory.model.js";
import ProductSubCategory from "../models/subCategory.model.js";
import { deleteUploadedFile } from "../middlewares/upload.middleware.js";

// helper
// const buildFileUrl = (filename, folder = "inner-category") => {
//   if (!filename) return null;
//   return `/uploads/${folder}/${filename}`;
// };

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// create
export const createInnerCategory = async (req, res, next) => {
  try {
    const { inner_category_name, category_id, sub_category_id } = req.body;
    let { status } = req.body;

    if (!inner_category_name?.trim()) {
      if (req.file) deleteUploadedFile(req.file.path);
      return res
        .status(400)
        .json({ message: "inner_category_name is required" });
    }

    if (
      !mongoose.Types.ObjectId.isValid(category_id) ||
      !mongoose.Types.ObjectId.isValid(sub_category_id)
    ) {
      if (req.file) deleteUploadedFile(req.file.path);
      return res
        .status(400)
        .json({ message: "Invalid category_id or sub_category_id" });
    }

    const [categoryExists, subCategoryExists] = await Promise.all([
      ProductCategory.exists({ _id: category_id }),
      ProductSubCategory.exists({ _id: sub_category_id }),
    ]);

    if (!categoryExists || !subCategoryExists) {
      if (req.file) deleteUploadedFile(req.file.path);
      return res.status(404).json({
        message: "Category or Sub Category not found",
      });
    }

    const duplicate = await ProductInnerCategory.findOne({
      category_id,
      sub_category_id,
      inner_category_name: {
        $regex: `^${escapeRegExp(inner_category_name)}$`,
        $options: "i",
      },
    });

    if (duplicate) {
      if (req.file) deleteUploadedFile(req.file.path);
      return res
        .status(409)
        .json({ message: "Inner category already exists" });
    }

    status =
      status === undefined || status === "" ? 1 : Number(status);

    if (![0, 1].includes(status)) {
      if (req.file) deleteUploadedFile(req.file.path);
      return res.status(400).json({ message: "status must be 0 or 1" });
    }

    // const imageUrl = req.file
    //   ? buildFileUrl(req.file.filename)
    //   : null;

    const doc = await ProductInnerCategory.create({
      inner_category_name: inner_category_name.trim(),
      // inner_category_image: imageUrl,
      category_id,
      sub_category_id,
      status,
    });

    res.status(201).json({ message: "Inner category created", data: doc });
  } catch (err) {
    // if (req.file) deleteUploadedFile(req.file.path);
    next(err);
  }
};

// list
export const listInnerCategories = async (req, res, next) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);
    const skip = (page - 1) * limit;

    const search = req.query.search?.trim();
    const status = req.query.status;
    const category_id = req.query.category_id;
    const sub_category_id = req.query.sub_category_id;

    const filter = {};

    if (search)
      filter.inner_category_name = {
        $regex: escapeRegExp(search),
        $options: "i",
      };

    if (status !== undefined) {
      const s = Number(status);
      if (![0, 1].includes(s))
        return res.status(400).json({ message: "Invalid status filter" });
      filter.status = s;
    }

    if (category_id) {
      if (!mongoose.Types.ObjectId.isValid(category_id))
        return res.status(400).json({ message: "Invalid category_id" });
      filter.category_id = new mongoose.Types.ObjectId(category_id);
    }

    if (sub_category_id) {
      if (!mongoose.Types.ObjectId.isValid(sub_category_id))
        return res.status(400).json({ message: "Invalid sub_category_id" });
      filter.sub_category_id = new mongoose.Types.ObjectId(sub_category_id);
    }

    const [total, items] = await Promise.all([
      ProductInnerCategory.countDocuments(filter),
      ProductInnerCategory.aggregate([
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
          $lookup: {
            from: "productsubcategories",
            localField: "sub_category_id",
            foreignField: "_id",
            as: "sub_category",
          },
        },
        { $unwind: "$sub_category" },
        {
          $addFields: {
            category_name: "$category.category_name",
            sub_category_name: "$sub_category.sub_category_name",
          },
        },
        { $project: { category: 0, sub_category: 0 } },
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

// GET SINGLE
export const getInnerCategory = async (req, res, next) => {
  try {
    const id = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid id" });

    const data = await ProductInnerCategory.aggregate([
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
        $lookup: {
          from: "productsubcategories",
          localField: "sub_category_id",
          foreignField: "_id",
          as: "sub_category",
        },
      },
      { $unwind: "$sub_category" },
      {
        $addFields: {
          category_name: "$category.category_name",
          sub_category_name: "$sub_category.sub_category_name",
        },
      },
      { $project: { category: 0, sub_category: 0 } },
    ]);

    if (!data.length)
      return res.status(404).json({ message: "Inner category not found" });

    res.json({ data: data[0] });
  } catch (err) {
    next(err);
  }
};

// UPDATE
export const updateInnerCategory = async (req, res, next) => {
  try {
    const id = req.params.id;
    const doc = await ProductInnerCategory.findById(id);

    if (!doc) {
      if (req.file) deleteUploadedFile(req.file.path);
      return res.status(404).json({ message: "Inner category not found" });
    }

    const { inner_category_name, category_id, sub_category_id } = req.body;
    let { status } = req.body;

    if (inner_category_name !== undefined) {
      if (!inner_category_name.trim()) {
        if (req.file) deleteUploadedFile(req.file.path);
        return res
          .status(400)
          .json({ message: "inner_category_name cannot be empty" });
      }
      doc.inner_category_name = inner_category_name.trim();
    }

    if (category_id) {
      if (!mongoose.Types.ObjectId.isValid(category_id))
        return res.status(400).json({ message: "Invalid category_id" });

      const exists = await ProductCategory.exists({ _id: category_id });
      if (!exists)
        return res.status(404).json({ message: "Category not found" });

      doc.category_id = category_id;
    }

    if (sub_category_id) {
      if (!mongoose.Types.ObjectId.isValid(sub_category_id))
        return res.status(400).json({ message: "Invalid sub_category_id" });

      const exists = await ProductSubCategory.exists({
        _id: sub_category_id,
      });
      if (!exists)
        return res.status(404).json({ message: "Sub category not found" });

      doc.sub_category_id = sub_category_id;
    }

    if (status !== undefined && status !== "") {
      status = Number(status);
      if (![0, 1].includes(status))
        return res.status(400).json({ message: "status must be 0 or 1" });
      doc.status = status;
    }

    // if (req.file) {
    //   if (doc.inner_category_image)
    //     deleteUploadedFile(doc.inner_category_image);
    //   doc.inner_category_image = buildFileUrl(req.file.filename);
    // }

    const updated = await doc.save();
    res.json({ message: "Inner category updated", data: updated });
  } catch (err) {
    // if (req.file) deleteUploadedFile(req.file.path);
    next(err);
  }
};

// DELETE
export const deleteInnerCategory = async (req, res, next) => {
  try {
    const doc = await ProductInnerCategory.findById(req.params.id);
    if (!doc)
      return res.status(404).json({ message: "Inner category not found" });

    // if (doc.inner_category_image)
    //   deleteUploadedFile(doc.inner_category_image);

    await ProductInnerCategory.deleteOne({ _id: doc._id });
    res.json({ message: "Inner category deleted" });
  } catch (err) {
    next(err);
  }
};
