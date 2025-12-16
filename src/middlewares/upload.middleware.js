import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ---------- ensure folder exists (SAFE) ---------- */
const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

/**
 * createUploadMiddleware(options)
 */
export function createUploadMiddleware({
  fieldName = "file",
  fields = null,
  folderName = "uploads",
  maxSize = 5 * 1024 * 1024,
  allowedMime = ["image/jpeg", "image/png", "image/webp", "image/gif"],
} = {}) {
  const uploadsRoot = path.resolve(process.cwd(), "uploads");
  const destFolder = path.join(uploadsRoot, folderName);

  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      // ✅ CRITICAL FIX: always ensure folder exists at runtime
      ensureDir(destFolder);
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

  // multi-field upload
  if (Array.isArray(fields) && fields.length > 0) {
    return upload.fields(fields);
  }

  // single upload
  return upload.single(fieldName);
}

/* ---------- delete file helper (unchanged) ---------- */
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
