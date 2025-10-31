// server.js
"use strict";

const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

/* =========================
   CORS Allowlist (ยืดหยุ่น)
   - เพิ่ม origin เพิ่มเติมผ่าน ENV: CORS_ORIGIN="https://foo.app,https://bar.app"
   ========================= */
const fromEnv = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const ALLOWLIST = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://trok6.vercel.app",
  ...fromEnv,
]);

app.use(
  cors({
    origin(origin, cb) {
      // ไม่มี Origin (เช่น Postman / server-to-server) → อนุญาต
      if (!origin) return cb(null, true);

      // อยู่ใน allowlist → อนุญาต
      if (ALLOWLIST.has(origin)) return cb(null, true);

      // อนุญาตโดเมนย่อยของ vercel.app ทั้งหมด (สะดวกตอน preview)
      if (/\.vercel\.app$/.test(origin)) return cb(null, true);

      // ไม่ผ่าน
      return cb(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
  })
);

// รองรับ preflight
app.options("*", cors());

// เพิ่มขนาด body เผื่อรูป/base64
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

// ให้เสิร์ฟไฟล์อัปโหลด ถ้ามีโฟลเดอร์ /uploads
app.use("/uploads", express.static("uploads", { fallthrough: true }));

/* =========================
   Routes หลักของแอพ
   ========================= */
const routes = require("./routes");
app.use("/", routes);

// Health check
app.get("/healthz", (_req, res) => res.json({ ok: true }));

// 404 JSON สำหรับเส้นทางที่ไม่พบ
app.use((req, res, next) => {
  res.status(404).json({ error: "NOT_FOUND", path: req.path });
});

// Error handler (รวมเคส CORS)
app.use((err, req, res, _next) => {
  if (err?.message?.startsWith?.("Not allowed by CORS")) {
    return res.status(403).json({
      error: "CORS_BLOCKED",
      origin: req.headers.origin || null,
      message: err.message,
    });
  }
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "INTERNAL_ERROR", message: err.message || String(err) });
});

/* =========================
   Start
   ========================= */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log("   CORS allowlist:", Array.from(ALLOWLIST).join(", ") || "(empty)");
});
