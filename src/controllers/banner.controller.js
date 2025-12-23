import Banner from "../models/banner.model.js";
import ProductCategory from "../models/productCategory.model.js";
import { deleteUploadedFile } from "../middlewares/upload.middleware.js";

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildFileUrl = (filename, folder = "banners") =>
  filename ? `/uploads/${folder}/${filename}` : null;

/* ---------------- CREATE ---------------- */
export const createBanner = async (req, res, next) => {
  try {
    const { banner_title, banner_sub_title, connected_category_id } = req.body;
    let { status } = req.body;

    const bannerImage = req.files?.banner_image?.[0];
    if (!bannerImage)
      return res.status(400).json({ message: "banner_image is required" });

    // validate category
    if (connected_category_id) {
      const exists = await ProductCategory.findById(connected_category_id);
      if (!exists) {
        deleteUploadedFile(bannerImage.path || bannerImage.filename);
        return res
          .status(400)
          .json({ message: "Invalid connected_category_id" });
      }
    }

    status =
      typeof status === "undefined"
        ? 1
        : [0, 1].includes(Number(status))
        ? Number(status)
        : 1;

    const doc = await Banner.create({
      banner_title: banner_title.trim(),
      banner_sub_title: banner_sub_title?.trim() || null,
      banner_image: buildFileUrl(bannerImage.filename),
      connected_category_id: connected_category_id || null,
      status,
    });

    res.status(201).json({ message: "Banner created", data: doc });
  } catch (err) {
    if (req.files)
      Object.values(req.files)
        .flat()
        .forEach((f) => deleteUploadedFile(f.path || f.filename));
    next(err);
  }
};

/* ---------------- LIST ---------------- */
export const listBanners = async (req, res, next) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);
    const search = req.query.search?.trim();
    const status =
      typeof req.query.status !== "undefined"
        ? Number(req.query.status)
        : undefined;

    const filter = {};
    if (search) {
      filter.$or = [
        { banner_title: { $regex: escapeRegExp(search), $options: "i" } },
        { banner_sub_title: { $regex: escapeRegExp(search), $options: "i" } },
      ];
    }
    if ([0, 1].includes(status)) filter.status = status;

    const skip = (page - 1) * limit;

    const [total, items] = await Promise.all([
      Banner.countDocuments(filter),
      Banner.find(filter)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    // attach category info
    const categoryIds = items
      .map((b) => b.connected_category_id)
      .filter(Boolean);

    const categories = await ProductCategory.find({
      _id: { $in: categoryIds },
    })
      .select("_id category_name")
      .lean();

    const categoryMap = Object.fromEntries(
      categories.map((c) => [c._id.toString(), c])
    );

    const data = items.map((b) => ({
      ...b,
      connected_category: b.connected_category_id
        ? categoryMap[b.connected_category_id.toString()] || null
        : null,
    }));

    res.json({
      meta: { total, page, limit, pages: Math.ceil(total / limit) || 1 },
      data,
    });
  } catch (err) {
    next(err);
  }
};

/* ---------------- GET SINGLE ---------------- */
export const getBanner = async (req, res, next) => {
  try {
    const doc = await Banner.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ message: "Banner not found" });

    let category = null;
    if (doc.connected_category_id) {
      category = await ProductCategory.findById(
        doc.connected_category_id
      ).select("_id category_name");
    }

    res.json({
      data: {
        ...doc,
        connected_category: category,
      },
    });
  } catch (err) {
    next(err);
  }
};

/* ---------------- UPDATE ---------------- */
export const updateBanner = async (req, res, next) => {
  try {
    const id = req.params.id;
    const { banner_title, banner_sub_title, connected_category_id } = req.body;
    let { status } = req.body;

    const bannerImage = req.files?.banner_image?.[0];
    const existing = await Banner.findById(id);
    if (!existing) {
      if (bannerImage)
        deleteUploadedFile(bannerImage.path || bannerImage.filename);
      return res.status(404).json({ message: "Banner not found" });
    }

    if (connected_category_id) {
      const exists = await ProductCategory.findById(connected_category_id);
      if (!exists)
        return res
          .status(400)
          .json({ message: "Invalid connected_category_id" });
      existing.connected_category_id = connected_category_id;
    }

    if (typeof banner_title !== "undefined")
      existing.banner_title = banner_title.trim();
    if (typeof banner_sub_title !== "undefined")
      existing.banner_sub_title = banner_sub_title?.trim() || null;

    if (typeof status !== "undefined" && status !== "") {
      existing.status = [0, 1].includes(Number(status))
        ? Number(status)
        : existing.status;
    }

    if (bannerImage) {
      if (existing.banner_image)
        deleteUploadedFile(existing.banner_image);
      existing.banner_image = buildFileUrl(bannerImage.filename);
    }

    const updated = await existing.save();
    res.json({ message: "Banner updated", data: updated });
  } catch (err) {
    next(err);
  }
};

/* ---------------- DELETE ---------------- */
export const deleteBanner = async (req, res, next) => {
  try {
    const doc = await Banner.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Banner not found" });

    if (doc.banner_image) deleteUploadedFile(doc.banner_image);
    await Banner.deleteOne({ _id: doc._id });

    res.json({ message: "Banner deleted" });
  } catch (err) {
    next(err);
  }
};
