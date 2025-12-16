import Brand from "../models/brands.model.js";
import { deleteUploadedFile } from "../middlewares/upload.middleware.js";

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildFileUrl = (filename, folder = "brands") => {
  if (!filename) return null;
  return `/uploads/${folder}/${filename}`;
};

/* --------------------- CREATE --------------------- */
export const createBrand = async (req, res, next) => {
  try {
    const { brand_name } = req.body;
    let { is_popular, status } = req.body;

    const brandImage = req.files?.brand_image?.[0];
    if (!brandImage) {
      return res.status(400).json({ message: "brand_image is required" });
    }

    if (!brand_name) {
      deleteUploadedFile(brandImage.path || brandImage.filename);
      return res.status(400).json({ message: "brand_name is required" });
    }

    // boolean handling
    is_popular = String(is_popular) === "true";

    // status handling
    if (typeof status === "undefined" || status === "")
      status = 1;
    else status = [0, 1].includes(Number(status)) ? Number(status) : 1;

    const doc = await Brand.create({
      brand_name: brand_name.trim(),
      brand_image: buildFileUrl(brandImage.filename),
      is_popular,
      status,
    });

    res.status(201).json({ message: "Brand created", data: doc });
  } catch (err) {
    if (req.files)
      Object.values(req.files)
        .flat()
        .forEach((f) => deleteUploadedFile(f.path || f.filename));
    next(err);
  }
};

/* --------------------- LIST --------------------- */
export const listBrands = async (req, res, next) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);

    const search = req.query.search?.trim();
    const status =
      typeof req.query.status !== "undefined"
        ? Number(req.query.status)
        : undefined;

    const is_popular =
      typeof req.query.is_popular !== "undefined"
        ? req.query.is_popular === "true"
        : undefined;

    const filter = {};

    if (search) {
      filter.brand_name = {
        $regex: escapeRegExp(search),
        $options: "i",
      };
    }

    if ([0, 1].includes(status)) filter.status = status;
    if (typeof is_popular === "boolean") filter.is_popular = is_popular;

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

/* --------------------- GET SINGLE --------------------- */
export const getBrand = async (req, res, next) => {
  try {
    const doc = await Brand.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ message: "Brand not found" });
    res.json({ data: doc });
  } catch (err) {
    next(err);
  }
};

/* --------------------- UPDATE --------------------- */
export const updateBrand = async (req, res, next) => {
  try {
    const id = req.params.id;
    const { brand_name } = req.body;
    let { is_popular, status } = req.body;

    const brandImage = req.files?.brand_image?.[0];

    const existing = await Brand.findById(id);
    if (!existing) {
      if (brandImage)
        deleteUploadedFile(brandImage.path || brandImage.filename);
      return res.status(404).json({ message: "Brand not found" });
    }

    if (typeof brand_name !== "undefined")
      existing.brand_name = brand_name.trim();

    if (typeof is_popular !== "undefined")
      existing.is_popular = String(is_popular) === "true";

    if (typeof status !== "undefined" && status !== "") {
      existing.status = [0, 1].includes(Number(status))
        ? Number(status)
        : existing.status;
    }

    if (brandImage) {
      if (existing.brand_image)
        deleteUploadedFile(existing.brand_image);
      existing.brand_image = buildFileUrl(brandImage.filename);
    }

    const updated = await existing.save();
    res.json({ message: "Brand updated", data: updated });
  } catch (err) {
    if (req.files)
      Object.values(req.files)
        .flat()
        .forEach((f) => deleteUploadedFile(f.path || f.filename));
    next(err);
  }
};

/* --------------------- DELETE --------------------- */
export const deleteBrand = async (req, res, next) => {
  try {
    const doc = await Brand.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Brand not found" });

    if (doc.brand_image) deleteUploadedFile(doc.brand_image);

    await Brand.deleteOne({ _id: doc._id });
    res.json({ message: "Brand deleted" });
  } catch (err) {
    next(err);
  }
};
