import Carousel from "../models/carousel.model.js";
import { deleteUploadedFile } from "../middlewares/upload.middleware.js";

/* Helpers */
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildFileUrl = (filename, folder = "carousel") => {
  if (!filename) return null;
  // const serverUrl = process.env.SERVER_URL || "";
  return `/uploads/${folder}/${filename}`;
};

/* CREATE (form-data) */
export const createCarousel = async (req, res, next) => {
  try {
    const { title, sub_title, description } = req.body;
    let { status } = req.body;

    const desktopFile = req.files?.desktop_file?.[0];
    // const mobileFile = req.files?.mobile_file?.[0];

    // desktop_file required
    if (!desktopFile) {
      // if (mobileFile) deleteUploadedFile(mobileFile.path || mobileFile.filename);
      return res.status(400).json({ message: "desktop_file is required" });
    }

    // handle status
    if (typeof status === "undefined" || status === null || status === "")
      status = 1;
    else status = [0, 1].includes(Number(status)) ? Number(status) : 1;

    const desktopUrl = buildFileUrl(desktopFile.filename);
    // const mobileUrl = mobileFile ? buildFileUrl(mobileFile.filename) : null;

    const doc = await Carousel.create({
      title: title?.trim() || null,
      sub_title: sub_title?.trim() || null,
      description: description?.trim() || null,
      desktop_file: desktopUrl,
      mobile_file: null,
      status,
    });

    res.status(201).json({ message: "Carousel created", data: doc });
  } catch (err) {
    // delete uploaded files on error
    if (req.files) {
      Object.values(req.files).flat().forEach((f) => deleteUploadedFile(f.path || f.filename));
    }
    next(err);
  }
};

/* LIST - pagination, search, status filter */
export const listCarousel = async (req, res, next) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);
    const search = req.query.search?.trim();
    const status = typeof req.query.status !== "undefined" ? Number(req.query.status) : undefined;

    const filter = {};
    if (search) {
      filter.$or = [
        { title: { $regex: escapeRegExp(search), $options: "i" } },
        { sub_title: { $regex: escapeRegExp(search), $options: "i" } },
        { description: { $regex: escapeRegExp(search), $options: "i" } },
      ];
    }
    if ([0, 1].includes(status)) filter.status = status;

    const skip = (page - 1) * limit;

    const [total, items] = await Promise.all([
      Carousel.countDocuments(filter),
      Carousel.find(filter).sort({ created_at: -1 }).skip(skip).limit(limit).lean(),
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
export const getCarousel = async (req, res, next) => {
  try {
    const doc = await Carousel.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ message: "Carousel not found" });
    res.json({ data: doc });
  } catch (err) {
    next(err);
  }
};

/* UPDATE (form-data) */
export const updateCarousel = async (req, res, next) => {
  try {
    const id = req.params.id;
    const { title, sub_title, description } = req.body;
    let { status } = req.body;

    const desktopFile = req.files?.desktop_file?.[0];
    // const mobileFile = req.files?.mobile_file?.[0];

    const existing = await Carousel.findById(id);
    if (!existing) {
      if (desktopFile) deleteUploadedFile(desktopFile.path || desktopFile.filename);
      // if (mobileFile) deleteUploadedFile(mobileFile.path || mobileFile.filename);
      return res.status(404).json({ message: "Carousel not found" });
    }

    if (typeof title !== "undefined") existing.title = title?.trim() || null;
    if (typeof sub_title !== "undefined") existing.sub_title = sub_title?.trim() || null;
    if (typeof description !== "undefined") existing.description = description?.trim() || null;

    if (typeof status !== "undefined" && status !== null && status !== "") {
      status = [0, 1].includes(Number(status)) ? Number(status) : existing.status;
      existing.status = status;
    }

    // file updates
    if (desktopFile) {
      if (existing.desktop_file) deleteUploadedFile(existing.desktop_file);
      existing.desktop_file = buildFileUrl(desktopFile.filename);
    }

    // if (mobileFile) {
    //   if (existing.mobile_file) deleteUploadedFile(existing.mobile_file);
    //   existing.mobile_file = buildFileUrl(mobileFile.filename);
    // }

    const updated = await existing.save();
    res.json({ message: "Carousel updated", data: updated });
  } catch (err) {
    if (req.files) {
      Object.values(req.files).flat().forEach((f) => deleteUploadedFile(f.path || f.filename));
    }
    next(err);
  }
};

/* DELETE */
export const deleteCarousel = async (req, res, next) => {
  try {
    const id = req.params.id;
    const doc = await Carousel.findById(id);
    if (!doc) return res.status(404).json({ message: "Carousel not found" });

    if (doc.desktop_file) deleteUploadedFile(doc.desktop_file);
    if (doc.mobile_file) deleteUploadedFile(doc.mobile_file);

    await Carousel.deleteOne({ _id: id });
    res.json({ message: "Carousel deleted" });
  } catch (err) {
    next(err);
  }
};
