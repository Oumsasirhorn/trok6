// backend/server.js
"use strict";
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

/** ----- CORS ที่ตั้งค่าได้จาก ENV ----- */
const ALLOW_ORIGINS = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);
const corsOptions = {
  origin(origin, cb) {
    // ไม่มี origin (เช่น curl/health) = อนุญาต
    if (!origin) return cb(null, true);
    if (ALLOW_ORIGINS.length === 0) return cb(null, true); // ไม่ตั้งค่าไว้ = อนุญาตทั้งหมด
    if (ALLOW_ORIGINS.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: true,
};
app.use(cors(corsOptions));
app.use(express.json());

/** ----- health check ต้องมาก่อนรวม routes ----- */
app.get("/healthz", (_req, res) => {
  res.status(200).json({
    ok: true,
    env: process.env.NODE_ENV || "development",
    uptime: process.uptime(),
    port: Number(process.env.PORT || 5000),
    time: new Date().toISOString(),
  });
});

/** ----- root เพื่อลองยิงง่าย ๆ ----- */
app.get("/", (_req, res) => {
  res.send("Restaurant API is running 🚀");
});

/** ----- รวมทุก routes ของระบบ ----- */
const routes = require("./routes/index");
app.use("/", routes);

/** ----- 404 + Error handler ----- */
app.use((req, res, next) => {
  if (res.headersSent) return next();
  res.status(404).json({ error: "NOT_FOUND", path: req.originalUrl });
});

app.use((err, _req, res, _next) => {
  const msg = typeof err === "string" ? err : (err?.message || "Internal error");
  res.status(500).json({ error: "INTERNAL_ERROR", detail: msg });
});

/** ----- Start server ----- */
const PORT = Number(process.env.PORT || 5000);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on :${PORT}`);
});
