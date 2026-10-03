import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import multer from "multer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const photosDir = path.join(__dirname, "..", "..", "uploads", "photos");
fs.mkdirSync(photosDir, { recursive: true });

export const PHOTO_MIME = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
export const BLOOD_GROUPS = new Set(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]);
export const TSHIRT_SIZES = new Set(["XS", "S", "M", "L", "XL", "XXL", "XXXL"]);
const MOBILE_RE = /^[0-9]{10}$/;

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, photosDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

export const photoUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!PHOTO_MIME.has(file.mimetype)) {
      return cb(new Error("Profile photo must be a JPG, PNG, or WEBP image."));
    }
    cb(null, true);
  },
});

export function validateRiderInput(body) {
  const errors = [];
  const required = [
    ["name", "Name"],
    ["mobileNumber", "Mobile number"],
    ["emergencyMobileNumber", "Emergency mobile number"],
    ["address", "Address"],
    ["city", "City"],
    ["bloodGroup", "Blood group"],
    ["tshirtSize", "T-shirt size"],
    ["birthDate", "Birth date"],
  ];

  for (const [key, label] of required) {
    if (!body[key] || String(body[key]).trim() === "") {
      errors.push(`${label} is required.`);
    }
  }

  if (body.mobileNumber && !MOBILE_RE.test(body.mobileNumber)) {
    errors.push("Mobile number must be exactly 10 digits.");
  }
  if (body.emergencyMobileNumber && !MOBILE_RE.test(body.emergencyMobileNumber)) {
    errors.push("Emergency mobile number must be exactly 10 digits.");
  }
  if (body.bloodGroup && !BLOOD_GROUPS.has(body.bloodGroup)) {
    errors.push("Blood group is not valid.");
  }
  if (body.tshirtSize && !TSHIRT_SIZES.has(body.tshirtSize)) {
    errors.push("T-shirt size is not valid.");
  }
  if (body.birthDate) {
    const dob = new Date(body.birthDate);
    if (Number.isNaN(dob.getTime()) || dob > new Date()) {
      errors.push("Birth date is not valid.");
    }
  }

  return errors;
}

export { MOBILE_RE };
