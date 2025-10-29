import fs from "fs";
import path from "path";

export default function deleteFile(fileUrl) {
  try {
    const filename = fileUrl.split("/uploads/")[1];
    if (!filename) return;
    const filePath = path.join(process.cwd(), "uploads", filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err) {
    console.error("File deletion error:", err.message);
  }
}
