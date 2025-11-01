// backend/server.js
"use strict";
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
require("dotenv").config();

const app = express();

/* ===== สำคัญสำหรับคุกกี้ secure หลัง proxy/HTTPS (Railway/Vercel) ===== */
app.set("trust proxy", 1);

/* ===== CORS จาก ENV (รองรับหลายโดเมน คั่นด้วย ,) ===== */
const ALLOW_ORIGINS = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, cb) {
    // ไม่มี origin (curl/health) => อนุญาต
    if (!origin) return cb(null, true);
    // ไม่ได้กำหนด -> อนุญาตทั้งหมด (ระวังโปรดักชัน)
    if (ALLOW_ORIGINS.length === 0) return cb(null, true);
    // ตรง allowlist
    if (ALLOW_ORIGINS.includes(origin)) return cb(null, true);
    // ไม่ตรง -> ปฏิเสธ (ยังคงตอบ 200 ได้ แต่ browser จะ block)
    return cb(new Error("CORS_NOT_ALLOWED"));
  },
  credentials: true,
  // เผื่อบาง client ต้องใช้ header เพิ่มเติม
  allowedHeaders: ["Content-Type", "Authorization"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
};

app.use(cookieParser());
app.use(cors(corsOptions));
// preflight (OPTIONS) ควรมาก่อนตัวอื่น ๆ
app.options("*", cors(corsOptions));

/* ===== Body parsers ===== */
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

/* ===== Health check ===== */
app.get("/healthz", (_req, res) => {
  res.status(200).json({
    ok: true,
    env: process.env.NODE_ENV || "development",
    uptime: process.uptime(),
    port: Number(process.env.PORT || 5000),
    time: new Date().toISOString(),
  });
});

/* ===== Root ===== */
app.get("/", (_req, res) => {
  res.send("Restaurant API is running 🚀");
});

/* ===== Routes ===== */
const routes = require("./routes/index");
app.use("/", routes);

/* ===== 404 ===== */
app.use((req, res, next) => {
  if (res.headersSent) return next();
  res.status(404).json({ error: "NOT_FOUND", path: req.originalUrl });
});

/* ===== Error handler ===== */
app.use((err, _req, res, _next) => {
  // ถ้าเป็น CORS error -> 403 เพื่ออ่านง่าย
  if (String(err?.message) === "CORS_NOT_ALLOWED") {
    return res.status(403).json({ error: "CORS_NOT_ALLOWED", origin: _req?.headers?.origin || null });
  }
  const msg = typeof err === "string" ? err : (err?.message || "Internal error");
  res.status(500).json({ error: "INTERNAL_ERROR", detail: msg });
});

/* ===== Start server ===== */
const PORT = Number(process.env.PORT || 5000);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on :${PORT}`);
});
