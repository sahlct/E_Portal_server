import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * createUploadMiddleware(options)
 * options: {
 *  fieldName: 'category_image',
 *  folderName: 'category',
 *  maxSize: number (bytes),
 *  allowedMime: [ ... ]
 * }
 */
export function createUploadMiddleware({
  fieldName = "category_image",
  folderName = "category",
  maxSize = 5 * 1024 * 1024, // 5 MB default
  allowedMime = ["image/jpeg", "image/png", "image/webp", "image/gif"],
} = {}) {
  const uploadsRoot = path.resolve(process.cwd(), "uploads");
  const destFolder = path.join(uploadsRoot, folderName);

  // ensure upload folder exists
  fs.mkdirSync(destFolder, { recursive: true });

  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, destFolder);
    },
    filename: function (req, file, cb) {
      // random name: timestamp-randhex.ext
      const ext = path.extname(file.originalname).toLowerCase();
      const rand = crypto.randomBytes(6).toString("hex");
      const filename = `${Date.now()}-${rand}${ext}`;
      cb(null, filename);
    },
  });

  const fileFilter = function (req, file, cb) {
    if (allowedMime.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Invalid file type. Only images allowed."));
  };

  const upload = multer({
    storage,
    limits: { fileSize: maxSize },
    fileFilter,
  });

  // return middleware that handles single file upload (fieldName)
  return upload.single(fieldName);
}

/**
 * Delete file helper - path relative to project root: uploads/<folder>/<filename>
 */
export function deleteUploadedFile(relativeFilePath) {
  if (!relativeFilePath) return;
  try {
    // relativeFilePath might be a URL: SERVER_URL/uploads/category/filename.ext
    // extract path after '/uploads'
    const idx = relativeFilePath.indexOf("/uploads/");
    let localPath;
    if (idx !== -1) {
      localPath = relativeFilePath.substring(idx + 1); // remove leading slash
    } else {
      // maybe they passed just 'uploads/category/filename'
      localPath = relativeFilePath;
    }
    const fullPath = path.resolve(process.cwd(), localPath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  } catch (err) {
    // ignore errors for now; controller logs on failure if needed
    console.error("Failed to delete file:", err.message);
  }
}
