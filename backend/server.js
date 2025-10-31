// server.js
"use strict";
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.set("trust proxy", 1);

/** ----- CORS allowlist (จาก ENV + ค่าเริ่มต้น) ----- */
const fromEnv = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const ALLOWLIST = new Set([
  "http://localhost:5173",
  "http://localhost:3000",
  "https://trok6.vercel.app",
  ...fromEnv,
]);
const ALLOW_RE = [/\.vercel\.app$/i]; // อนุญาตทุกซับโดเมน *.vercel.app

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true); // healthz/Postman
      if (ALLOWLIST.has(origin)) return cb(null, true);
      if (ALLOW_RE.some(rx => rx.test(origin))) return cb(null, true);
      return cb(new Error(`Not allowed by CORS: ${origin}`));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true, // เปิดไว้ ถ้าจะรับส่ง cookie
  })
);
app.options("*", cors());

app.use(express.json());

/** ----- health check ----- */
app.get("/healthz", (_req, res) => {
  res.status(200).json({
    ok: true,
    env: process.env.NODE_ENV || "development",
    uptime: process.uptime(),
    port: Number(process.env.PORT || 5000),
    time: new Date().toISOString(),
  });
});

/** ----- root ----- */
app.get("/", (_req, res) => {
  res.send("Restaurant API is running 🚀");
});

/** ----- routes ----- */
const routes = require("./routes/index");
app.use("/", routes);

/** ----- 404 + Error handler ----- */
app.use((req, res, next) => {
  if (res.headersSent) return next();
  res.status(404).json({ error: "NOT_FOUND", path: req.originalUrl });
});

app.use((err, _req, res, _next) => {
  const msg = typeof err === "string" ? err : err?.message || "Internal error";
  res.status(500).json({ error: "INTERNAL_ERROR", detail: msg });
});

/** ----- Start server ----- */
const PORT = Number(process.env.PORT || 5000);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on :${PORT}`);
});
