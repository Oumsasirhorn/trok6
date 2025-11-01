// server.js
"use strict";

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
require("dotenv").config();

const app = express();

/* ===== Proxy & Cookies (สำหรับ Railway/HTTPS) ===== */
app.set("trust proxy", 1);

/* ===== CORS: อ่านจาก ENV CORS_ORIGIN (คั่นด้วย ,) =====
   ตัวอย่างค่า:
   CORS_ORIGIN=https://trok-frontend.vercel.app,https://admin.trok.app,http://localhost:5173
*/
const normalize = (s) => String(s || "").trim().replace(/\/+$/, "").toLowerCase();
const ALLOW_ORIGINS = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map(normalize)
  .filter(Boolean);

const corsOptions = {
  origin(origin, cb) {
    // อนุญาตกรณีเครื่องมือ/health ที่ไม่มี Origin
    if (!origin) return cb(null, true);
    const ok = ALLOW_ORIGINS.length === 0 || ALLOW_ORIGINS.includes(normalize(origin));
    // ถ้าไม่อยู่ใน allow-list: ไม่ใส่ CORS header (ไม่ throw เพื่อไม่ทำให้ล่ม)
    return ok ? cb(null, true) : cb(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};
app.use(cookieParser());
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

/* ===== Body parsers ===== */
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

/* ===== Health check (ไม่แตะ DB เพื่อไม่ค้าง) ===== */
app.get("/healthz", (_req, res) => {
  res.status(200).json({
    ok: true,
    env: process.env.NODE_ENV || "development",
    uptime: process.uptime(),
    port: Number(process.env.PORT || 5000),
    time: new Date().toISOString(),
  });
});

/* ===== Root (ทดสอบเร็ว) ===== */
app.get("/", (_req, res) => {
  res.send("Restaurant API is running 🚀");
});

/* ===== Debug Router registration (อ่าน log อย่างเดียว ไม่ยุ่ง app.use) ===== */
(function patchRouterDebug() {
  const methods = ["use","get","post","put","patch","delete","options","head","all"];
  const _Router = express.Router;
  express.Router = function (...args) {
    const r = _Router.apply(this, args);
    for (const m of methods) {
      const orig = r[m].bind(r);
      r[m] = function (path, ...rest) {
        try {
          if (typeof path === "string") {
            // log เฉพาะ string path เพื่อตามหาจุดผิดง่าย
            console.log(`[ROUTER.${m.toUpperCase()}]`, path);
          }
          return orig(path, ...rest);
        } catch (e) {
          console.error(`[ROUTER.${m.toUpperCase()} FAIL]`, path, "=>", e && e.message);
          throw e;
        }
      };
    }
    return r;
  };
})();

/* ===== Routes (สำคัญ: ใช้ "path" ไม่ใช่ "URL เต็ม") ===== */
const routes = require("./routes/index");
// เปลี่ยนจาก "/" เป็น "/api" เพื่อกันชนกับหน้า root และหลีกเลี่ยง path แปลก ๆ
app.use("/api", routes);

/* ===== 404 ===== */
app.use((req, res, next) => {
  if (res.headersSent) return next();
  res.status(404).json({ error: "NOT_FOUND", path: req.originalUrl });
});

/* ===== Error handler (อย่าทำให้ CORS กลายเป็น 500) ===== */
app.use((err, _req, res, _next) => {
  const msg = typeof err === "string" ? err : (err?.message || "Internal error");
  console.error("ERROR:", msg);
  if (res.headersSent) return;
  res.status(500).json({ error: "INTERNAL_ERROR", detail: msg });
});

/* ===== Start server ===== */
const PORT = Number(process.env.PORT || 5000);
// สำคัญมาก: ต้อง bind 0.0.0.0 และฟังที่ PORT ของ Railway
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on :${PORT}`);
});

// กัน process ตายเงียบ ๆ
process.on("unhandledRejection", (e) => console.error("unhandledRejection:", e));
process.on("uncaughtException", (e) => console.error("uncaughtException:", e));
