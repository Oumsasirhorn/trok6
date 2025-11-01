"use strict";
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
require("dotenv").config();

const app = express();

/* ===== ให้คุกกี้ secure ทำงานหลัง proxy/HTTPS (Railway/Vercel) ===== */
app.set("trust proxy", 1);

/* ===== CORS จาก ENV (รองรับหลายโดเมน, normalize ตัด / ท้าย, ตัวพิมพ์เล็ก) ===== */
const normalize = (s) => String(s || "").trim().replace(/\/+$/, "").toLowerCase();
const ALLOW_ORIGINS = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map(normalize)
  .filter(Boolean);

const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);                 // healthz/curl/no-origin
    const ok = ALLOW_ORIGINS.length === 0 || ALLOW_ORIGINS.includes(normalize(origin));
    return cb(null, ok);                                 // อย่า throw error
  },
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
};
app.use(cookieParser());
app.use(cors(corsOptions));
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


/* ===== DEBUG: บอกเส้นทางไหน register แล้วพัง ===== */
(function patchExpressForPathDebug() {
  const methods = ["use","get","post","put","patch","delete","options","head","all"];

  // patch app.use เพื่อ log ตอน mount router ด้วย path
  const _appUse = app.use.bind(app);
  app.use = function (path, ...handlers) {
    try {
      console.log("[APP.USE] mount at:", path);
      return _appUse(path, ...handlers);
    } catch (e) {
      console.error("[APP.USE FAIL] path =", path, "=>", e && e.message);
      throw e;
    }
  };

  // patch express.Router เพื่อ log ทุกครั้งที่ลงทะเบียน route
  const _Router = express.Router;
  express.Router = function (...args) {
    const r = _Router.apply(this, args);
    for (const m of methods) {
      const orig = r[m].bind(r);
      r[m] = function (path, ...rest) {
        try {
          // บางที express อนุญาตเรียก r.use(middleware) ที่ arg แรกไม่ใช่ path
          if (typeof path === "string") {
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

/* ===== Routes ===== */
const routes = require("./routes/index");
app.use("/", routes);

/* ===== 404 ===== */
app.use((req, res, next) => {
  if (res.headersSent) return next();
  res.status(404).json({ error: "NOT_FOUND", path: req.originalUrl });
});

/* ===== Error handler (อย่าจับ CORS เป็น error) ===== */
app.use((err, _req, res, _next) => {
  const msg = typeof err === "string" ? err : (err?.message || "Internal error");
  res.status(500).json({ error: "INTERNAL_ERROR", detail: msg });
});

/* ===== Start server ===== */
const PORT = Number(process.env.PORT || 5000);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on :${PORT}`);
});
