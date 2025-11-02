import Brand from "../models/brand.model.js";
import { deleteUploadedFile } from "../middlewares/upload.middleware.js";

const buildFileUrl = (filename, folder = "brands") => {
  if (!filename) return null;
  const serverUrl = process.env.SERVER_URL || "";
  return `${serverUrl.replace(/\/$/, "")}/uploads/${folder}/${filename}`;
};

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* CREATE (supports single or multiple uploads) */
export const createBrands = async (req, res, next) => {
  try {
    const files = req.files?.brand_logo;
    if (!files || files.length === 0)
      return res.status(400).json({ message: "brand_logo is required" });

    const brands = files.map((file) => ({
      brand_logo: buildFileUrl(file.filename),
      status: [0, 1].includes(Number(req.body.status))
        ? Number(req.body.status)
        : 1,
    }));

    const docs = await Brand.insertMany(brands);
    res.status(201).json({
      message: "Brand(s) created successfully",
      data: docs,
    });
  } catch (err) {
    if (req.files?.brand_logo) {
      req.files.brand_logo.forEach((f) => deleteUploadedFile(f.path || f.filename));
    }
    next(err);
  }
};

/* LIST - pagination + status filter */
export const listBrands = async (req, res, next) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);
    const status =
      typeof req.query.status !== "undefined"
        ? Number(req.query.status)
        : undefined;

    const filter = {};
    if ([0, 1].includes(status)) filter.status = status;

    const skip = (page - 1) * limit;

    const [total, items] = await Promise.all([
      Brand.countDocuments(filter),
      Brand.find(filter)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    res.json({
      meta: { total, page, limit, pages: Math.ceil(total / limit) || 1 },
      data: items,
    });
  } catch (err) {
    next(err);
  }
};

/* GET SINGLE */
export const getBrand = async (req, res, next) => {
  try {
    const brand = await Brand.findById(req.params.id).lean();
    if (!brand) return res.status(404).json({ message: "Brand not found" });
    res.json({ data: brand });
  } catch (err) {
    next(err);
  }
};

/* UPDATE (form-data) */
export const updateBrand = async (req, res, next) => {
  try {
    const id = req.params.id;
    let { status } = req.body;
    const file = req.files?.brand_logo?.[0];

    const existing = await Brand.findById(id);
    if (!existing) {
      if (file) deleteUploadedFile(file.path || file.filename);
      return res.status(404).json({ message: "Brand not found" });
    }

    if (file) {
      if (existing.brand_logo) deleteUploadedFile(existing.brand_logo);
      existing.brand_logo = buildFileUrl(file.filename);
    }

    if (typeof status !== "undefined" && status !== null && status !== "") {
      status = [0, 1].includes(Number(status))
        ? Number(status)
        : existing.status;
      existing.status = status;
    }

    const updated = await existing.save();
    res.json({ message: "Brand updated successfully", data: updated });
  } catch (err) {
    if (req.files?.brand_logo) {
      req.files.brand_logo.forEach((f) =>
        deleteUploadedFile(f.path || f.filename)
      );
    }
    next(err);
  }
};

/* DELETE SINGLE */
export const deleteBrand = async (req, res, next) => {
  try {
    const brand = await Brand.findById(req.params.id);
    if (!brand) return res.status(404).json({ message: "Brand not found" });

    if (brand.brand_logo) deleteUploadedFile(brand.brand_logo);

    await Brand.deleteOne({ _id: req.params.id });
    res.json({ message: "Brand deleted successfully" });
  } catch (err) {
    next(err);
  }
};

/* DELETE MULTIPLE */
export const deleteMultipleBrands = async (req, res, next) => {
  try {
    const ids = req.body.ids;
    if (!Array.isArray(ids) || ids.length === 0)
      return res.status(400).json({ message: "ids array required" });

    const brands = await Brand.find({ _id: { $in: ids } });
    brands.forEach((b) => b.brand_logo && deleteUploadedFile(b.brand_logo));

    await Brand.deleteMany({ _id: { $in: ids } });
    res.json({ message: "Selected brands deleted successfully" });
  } catch (err) {
    next(err);
  }
};


/* BULK STATUS UPDATE (activate or deactivate multiple brands) */
export const bulkUpdateBrandStatus = async (req, res, next) => {
  try {
    const { ids, status } = req.body;

    if (!Array.isArray(ids) || ids.length === 0)
      return res.status(400).json({ message: "ids array required" });

    if (![0, 1].includes(Number(status)))
      return res.status(400).json({ message: "Invalid status value" });

    const result = await Brand.updateMany(
      { _id: { $in: ids } },
      { $set: { status: Number(status) } }
    );

    res.json({
      message:
        Number(status) === 1
          ? "Selected brands activated successfully"
          : "Selected brands deactivated successfully",
      data: result,
    });
  } catch (err) {
    next(err);
  }
};
