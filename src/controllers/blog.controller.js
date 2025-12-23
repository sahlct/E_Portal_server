import Blog from "../models/blog.model.js";
import { deleteUploadedFile } from "../middlewares/upload.middleware.js";

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildFileUrl = (filename, folder = "blogs") => {
  if (!filename) return null;
  return `/uploads/${folder}/${filename}`;
};

/* --------------------- CREATE (form-data) --------------------- */
export const createBlog = async (req, res, next) => {
  try {
    const { blog_title, blog_sec_title, description, date, place, sec_description } = req.body;
    let { status } = req.body;

    const blogThumbnail = req.files?.blog_thumbnail?.[0];
    const otherImages = req.files?.other_images || [];

    if (!blogThumbnail) {
      otherImages.forEach((f) => deleteUploadedFile(f.path || f.filename));
      return res.status(400).json({ message: "blog_thumbnail is required" });
    }

    if (!date) {
      deleteUploadedFile(blogThumbnail.path || blogThumbnail.filename);
      otherImages.forEach((f) => deleteUploadedFile(f.path || f.filename));
      return res.status(400).json({ message: "date is required" });
    }

    // handle status
    if (typeof status === "undefined" || status === null || status === "")
      status = 1;
    else status = [0, 1].includes(Number(status)) ? Number(status) : 1;

    const blogThumbUrl = buildFileUrl(blogThumbnail.filename);
    const otherImagesUrls = otherImages.map((f) => buildFileUrl(f.filename));

    const doc = await Blog.create({
      blog_title: blog_title.trim(),
      blog_thumbnail: blogThumbUrl,
      blog_sec_title: blog_sec_title?.trim() || null,
      description: description?.trim() || null,
      sec_description: sec_description?.trim() || null,
      date,
      place: place?.trim() || null,
      other_images: otherImagesUrls,
      status,
    });

    res.status(201).json({ message: "Blog created", data: doc });
  } catch (err) {
    if (req.files)
      Object.values(req.files)
        .flat()
        .forEach((f) => deleteUploadedFile(f.path || f.filename));
    next(err);
  }
};

/* --------------------- LIST (pagination + filter) --------------------- */
export const listBlogs = async (req, res, next) => {
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
        { blog_title: { $regex: escapeRegExp(search), $options: "i" } },
        { blog_sec_title: { $regex: escapeRegExp(search), $options: "i" } },
        { description: { $regex: escapeRegExp(search), $options: "i" } },
        { place: { $regex: escapeRegExp(search), $options: "i" } },
      ];
    }
    if ([0, 1].includes(status)) filter.status = status;

    const skip = (page - 1) * limit;

    const [total, items] = await Promise.all([
      Blog.countDocuments(filter),
      Blog.find(filter).sort({ created_at: -1 }).skip(skip).limit(limit).lean(),
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
export const getBlog = async (req, res, next) => {
  try {
    const doc = await Blog.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ message: "Blog not found" });
    res.json({ data: doc });
  } catch (err) {
    next(err);
  }
};

/* --------------------- UPDATE (form-data) --------------------- */
export const updateBlog = async (req, res, next) => {
  try {
    const id = req.params.id;
    const { blog_title, blog_sec_title, description, date, place, sec_description } = req.body;
    let { status } = req.body;

    const blogThumbnail = req.files?.blog_thumbnail?.[0];
    const otherImages = req.files?.other_images || [];

    const existing = await Blog.findById(id);
    if (!existing) {
      if (blogThumbnail) deleteUploadedFile(blogThumbnail.path || blogThumbnail.filename);
      otherImages.forEach((f) => deleteUploadedFile(f.path || f.filename));
      return res.status(404).json({ message: "Blog not found" });
    }

    if (typeof blog_title !== "undefined")
      existing.blog_title = blog_title.trim();
    if (typeof blog_sec_title !== "undefined")
      existing.blog_sec_title = blog_sec_title?.trim() || null;
    if (typeof description !== "undefined")
      existing.description = description?.trim() || null;
    if (typeof sec_description !== "undefined")
      existing.sec_description = sec_description?.trim() || null;
    if (typeof date !== "undefined") existing.date = date;
    if (typeof place !== "undefined") existing.place = place?.trim() || null;

    if (typeof status !== "undefined" && status !== null && status !== "") {
      status = [0, 1].includes(Number(status))
        ? Number(status)
        : existing.status;
      existing.status = status;
    }

    if (blogThumbnail) {
      if (existing.blog_thumbnail) deleteUploadedFile(existing.blog_thumbnail);
      existing.blog_thumbnail = buildFileUrl(blogThumbnail.filename);
    }

    if (otherImages.length > 0) {
      existing.other_images = [
        ...existing.other_images,
        ...otherImages.map((f) => buildFileUrl(f.filename)),
      ];
    }

    const updated = await existing.save();
    res.json({ message: "Blog updated", data: updated });
  } catch (err) {
    if (req.files)
      Object.values(req.files)
        .flat()
        .forEach((f) => deleteUploadedFile(f.path || f.filename));
    next(err);
  }
};

/* --------------------- DELETE --------------------- */
export const deleteBlog = async (req, res, next) => {
  try {
    const id = req.params.id;
    const doc = await Blog.findById(id);
    if (!doc) return res.status(404).json({ message: "Blog not found" });

    if (doc.blog_thumbnail) deleteUploadedFile(doc.blog_thumbnail);
    doc.other_images.forEach((img) => deleteUploadedFile(img));

    await Blog.deleteOne({ _id: id });
    res.json({ message: "Blog deleted" });
  } catch (err) {
    next(err);
  }
};
