import User from "../models/user.model.js";
import { generateToken } from "../utils/token.js";
import { sendMail } from "../utils/mailer.js";
import jwt from "jsonwebtoken";

// temporary OTP store in memory
const otpStore = new Map();

// =================== REGISTER ===================
export const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ message: "Email already exists" });

    const user = new User({ name, email, password });
    await user.save();

    const token = generateToken(user._id, user.email);
    res.status(201).json({
      token,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    next(err);
  }
};

// =================== LOGIN ===================
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });

    const token = generateToken(user._id, user.email);
    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    next(err);
  }
};

// =================== VERIFY TOKEN ===================
export const verifyToken = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "No token provided" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    res.json({ valid: true, decoded });
  } catch (error) {
    res.status(401).json({ valid: false, message: "Invalid or expired token" });
  }
};

// =================== SEND OTP VIA EMAIL ===================
export const sendOtpMail = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "Email not registered" });

    const otp = Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit OTP
    otpStore.set(email, { otp, expiresAt: Date.now() + 5 * 60 * 1000 }); // valid 5 minutes

    await sendMail(
      email,
      "Your OTP Verification Code",
      `<h3>Your OTP is: <b>${otp}</b></h3><p>This code expires in 5 minutes.</p>`
    );

    res.json({ message: "OTP sent successfully" });
  } catch (err) {
    next(err);
  }
};

// =================== VERIFY OTP ===================
export const verifyOtp = async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    const record = otpStore.get(email);

    if (!record) return res.status(400).json({ message: "OTP not found or expired" });
    if (record.otp !== otp) return res.status(400).json({ message: "Invalid OTP" });
    if (Date.now() > record.expiresAt) {
      otpStore.delete(email);
      return res.status(400).json({ message: "OTP expired" });
    }

    otpStore.delete(email);
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    const token = generateToken(user._id, user.email);
    res.json({
      message: "OTP verified successfully",
      token,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    next(err);
  }
};

// =================== RESET PASSWORD ===================
export const resetPassword = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "Token missing" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.email !== email)
      return res.status(401).json({ message: "Token email mismatch" });

    const user = await User.findById(decoded.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.password = password; 
    await user.save();

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    next(err);
  }
};
