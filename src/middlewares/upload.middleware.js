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
 *  fieldName?: string,
 *  fields?: [ { name: string, maxCount?: number } ],
 *  folderName?: string,
 *  maxSize?: number,
 *  allowedMime?: string[],
 * }
 */
export function createUploadMiddleware({
  fieldName = "file",
  fields = null,
  folderName = "uploads",
  maxSize = 5 * 1024 * 1024, // 5 MB default
  allowedMime = ["image/jpeg", "image/png", "image/webp", "image/gif"],
} = {}) {
  const uploadsRoot = path.resolve(process.cwd(), "uploads");
  const destFolder = path.join(uploadsRoot, folderName);
  fs.mkdirSync(destFolder, { recursive: true });

  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, destFolder);
    },
    filename: function (req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase();
      const rand = crypto.randomBytes(6).toString("hex");
      cb(null, `${Date.now()}-${rand}${ext}`);
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

  // ✅ If multiple fields provided, handle multi-field upload
  if (Array.isArray(fields) && fields.length > 0) {
    return upload.fields(fields);
  }

  // ✅ Default to single upload
  return upload.single(fieldName);
}

/**
 * Delete file helper
 */
export function deleteUploadedFile(relativeFilePath) {
  if (!relativeFilePath) return;
  try {
    const idx = relativeFilePath.indexOf("/uploads/");
    let localPath;
    if (idx !== -1) {
      localPath = relativeFilePath.substring(idx + 1);
    } else {
      localPath = relativeFilePath;
    }
    const fullPath = path.resolve(process.cwd(), localPath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  } catch (err) {
    console.error("Failed to delete file:", err.message);
  }
}
