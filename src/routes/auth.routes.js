import { Router } from "express";
import {
  register,
  login,
  verifyToken,
  sendOtpMail,
  verifyOtp,
  resetPassword,
} from "../controllers/auth.controller.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/verify-token", verifyToken);

// email + otp verification
router.post("/mail-verify", sendOtpMail);
router.post("/otp-verify", verifyOtp);

// reset password
router.post("/reset-password", resetPassword);

export default router;
