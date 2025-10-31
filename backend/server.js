// backend/server.js
"use strict";

const path = require("path");
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

/* ===================== CORS ===================== */
// อนุญาตหลายโดเมนได้ด้วย CORS_ORIGIN คั่นด้วย comma
// ตัวอย่าง: "https://trokkk.vercel.app,http://localhost:5173,https://trok6-production.up.railway.app"
const ALLOW_LIST = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const corsOptions = {
  credentials: true,
  origin(origin, cb) {
    // อนุญาตเครื่องมืออย่าง curl / health-check ที่ไม่มี Origin
    if (!origin) return cb(null, true);
    if (ALLOW_LIST.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS blocked: ${origin}`), false);
  },
};
app.use(cors(corsOptions));
// preflight
app.options("*", cors(corsOptions));

/* ================== Parsers / Static ================== */
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

// ให้เสิร์ฟไฟล์อัปโหลด (ถ้ามี) เช่น /uploads/slips/xxx.jpg
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

/* ===================== Routes ===================== */
try {
  const routes = require("./routes/index");
  // ถ้าต้องการ prefix เป็น /api ให้เปลี่ยนเป็น: app.use("/api", routes);
  app.use("/", routes);
} catch (e) {
  console.warn("⚠️  Cannot load ./routes/index. Skipping route mount.", e?.message || e);
}

/* ================== Health / Root ================== */
app.get("/healthz", (_req, res) =>
  res.json({ ok: true, uptime: process.uptime(), env: "production" })
);

app.get("/", (_req, res) => res.send("Restaurant API is running 🚀"));

/* ================== 404 & Error Handler ================== */
app.use((req, res, next) => {
  if (res.headersSent) return next();
  res.status(404).json({ error: "NOT_FOUND", path: req.originalUrl });
});

app.use((err, req, res, _next) => {
  console.error("🔥 Error:", err);
  const msg = typeof err === "string" ? err : err?.message || "Internal error";
  res.status(500).json({ error: "INTERNAL_ERROR", detail: msg });
});

/* ===================== Start ===================== */
const PORT = Number(process.env.PORT || 5000);
// สำคัญ: ต้อง bind 0.0.0.0 เพื่อรับทราฟฟิกจากภายนอกบน Railway
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on :${PORT}`);
});
