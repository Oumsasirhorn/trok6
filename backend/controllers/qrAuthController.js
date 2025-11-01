// backend/controllers/qrAuthController.js
"use strict";

const CryptoJS = require("crypto-js");
const QRCode   = require("qrcode");
const dayjs    = require("dayjs");
const pool     = require("../DB/db"); // ใช้ pool เดิมของโปรเจกต์

/** ===== Config from ENV ===== */
const FRONT_URL        = process.env.FRONT_URL || "http://localhost:5173";
const QR_SECRET        = process.env.QR_SECRET || "dev_secret_change_me";
const QR_TTL           = Number.parseInt(process.env.QR_TTL_SECONDS ?? "86400", 10);      // อายุลิงก์ใน QR (วินาที)
const SESSION_TTL_MIN  = Number.parseInt(process.env.SESSION_TTL_MINUTES ?? "480", 10);   // อายุ session โต๊ะ (นาที)
const IS_PROD          = process.env.NODE_ENV === "production";

/** ===== Helpers ===== */
const sign = (obj) =>
  CryptoJS.HmacSHA256(JSON.stringify(obj), QR_SECRET).toString(CryptoJS.enc.Hex);

const verify = (obj, sig) => sign(obj) === String(sig);

/** สร้าง URL ที่จะฝังลงใน QR */
function buildSignedUrl(tableNumber, tsUnix) {
  const u = new URL("/order", FRONT_URL);
  u.searchParams.set("table", tableNumber);
  u.searchParams.set("ts", String(tsUnix));
  u.searchParams.set("sig", sign({ table_number: tableNumber, ts: tsUnix }));
  return u.toString();
}

/** แปลง timestamp(ms) -> 'YYYY-MM-DD HH:mm:ss' สำหรับ MySQL */
function toMySQL(dt) {
  return dayjs(dt).format("YYYY-MM-DD HH:mm:ss");
}

/** ==============================================================
 *  GET /qr/:tableNumber.png
 *  สร้างภาพ QR (PNG) พร้อมลายเซ็น และอัปเดต tables.qr_code / qr_expire
 *  ============================================================== */
exports.generateSignedQR = async (req, res) => {
  try {
    const tableNumber = String(req.params.tableNumber || "").trim();
    if (!tableNumber) return res.status(400).send("missing tableNumber");

    // ต้องมีแถวโต๊ะอยู่ก่อนใน DB
    const [rows] = await pool.query(
      "SELECT table_id FROM tables WHERE table_number=? LIMIT 1",
      [tableNumber]
    );
    if (!rows.length) return res.status(404).send("table not found");

    // ออกลิงก์พร้อมลายเซ็น
    const ts  = Math.floor(Date.now() / 1000) + QR_TTL;
    const url = buildSignedUrl(tableNumber, ts);

    // แปลงเป็น PNG
    const png = await QRCode.toBuffer(url, { width: 1200, margin: 1 });
    const dataUrl = `data:image/png;base64,${png.toString("base64")}`;

    // อัปเดตคอลัมน์ใน DB (สำหรับใช้ในหน้าแอดมิน/ปริ้นท์)
    await pool.query(
      "UPDATE tables SET qr_code=?, qr_expire=? WHERE table_id=?",
      [dataUrl, toMySQL(ts * 1000), rows[0].table_id]
    );

    res.setHeader("Content-Type", "image/png");
    res.send(png);
  } catch (e) {
    console.error("generateSignedQR error:", e);
    res.status(500).send("QR generation failed");
  }
};

/** ==============================================================
 *  GET /api/qr/validate?table=&ts=&sig=
 *  ตรวจลายเซ็นจากลิงก์ QR → ออกคุกกี้ session โต๊ะ + ล็อกสถานะโต๊ะ
 *  ============================================================== */
exports.validateAndCreateSession = async (req, res) => {
  try {
    const { table, ts, sig } = req.query;
    if (!table || !ts || !sig) {
      return res.status(400).json({ ok: false, reason: "missing_params" });
    }

    const payload = { table_number: String(table), ts: Number(ts) };
    if (!verify(payload, String(sig))) {
      return res.status(401).json({ ok: false, reason: "bad_signature" });
    }
    if (payload.ts < Math.floor(Date.now() / 1000)) {
      return res.status(401).json({ ok: false, reason: "expired" });
    }

    const [rows] = await pool.query(
      "SELECT table_id, table_number FROM tables WHERE table_number=? LIMIT 1",
      [payload.table_number]
    );
    if (!rows.length) {
      return res.status(404).json({ ok: false, reason: "table_not_found" });
    }

    const tableId = rows[0].table_id;

    // ทำให้ session token ไม่ซ้ำและตรวจสอบได้
    const token   = CryptoJS.SHA256(`${tableId}.${Date.now()}.${Math.random()}`)
                      .toString(CryptoJS.enc.Hex);
    const expires = dayjs().add(SESSION_TTL_MIN, "minute");

    // ปิด session เก่าๆ ของโต๊ะนี้ก่อน
    await pool.query(
      "UPDATE table_sessions SET is_active=0 WHERE table_id=? AND is_active=1",
      [tableId]
    );

    // บันทึก session ใหม่
    await pool.query(
      "INSERT INTO table_sessions (table_id, session_token, expires_at, is_active) VALUES (?,?,?,1)",
      [tableId, token, toMySQL(expires)]
    );

    // ล็อกสถานะโต๊ะเป็น 'กำลังใช้งาน' (ถ้าตาราง Beam ใช้ค่านี้)
    await pool.query("UPDATE tables SET status='กำลังใช้งาน' WHERE table_id=?", [tableId]);

    // ออกคุกกี้ (โปรดักชันต้อง secure: true + ต้องมี app.set('trust proxy', 1) ใน server.js)
    res.cookie("tsession", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: IS_PROD,
      maxAge: SESSION_TTL_MIN * 60 * 1000,
    });

    res.json({ ok: true, table_id: tableId, table_number: rows[0].table_number });
  } catch (e) {
    console.error("validate error:", e);
    res.status(500).json({ ok: false, reason: "server_error" });
  }
};

/** ==============================================================
 *  Middleware: ต้องมี session โต๊ะที่ยังไม่หมดอายุ
 *  เติม req.table_id / req.table_number ให้ controller ถัดไปใช้
 *  ============================================================== */
exports.requireTableSession = async (req, res, next) => {
  try {
    const token = req.cookies?.tsession;
    if (!token) return res.status(401).json({ error: "no_table_session" });

    const [rows] = await pool.query(
      `SELECT s.table_id, t.table_number
         FROM table_sessions s
         JOIN tables t ON s.table_id = t.table_id
        WHERE s.session_token = ? AND s.is_active = 1 AND s.expires_at > NOW()
        LIMIT 1`,
      [token]
    );
    if (!rows.length) return res.status(401).json({ error: "invalid_or_expired_session" });

    req.table_id = rows[0].table_id;
    req.table_number = rows[0].table_number;
    next();
  } catch (e) {
    console.error("requireTableSession error:", e);
    res.status(500).json({ error: "server_error" });
  }
};

/** ==============================================================
 *  POST /api/tables/release
 *  ปล่อยโต๊ะ: ปิด session ที่ค้างอยู่ + ตั้งสถานะโต๊ะเป็น 'ว่าง'
 *  ============================================================== */
exports.releaseTable = async (req, res) => {
  try {
    if (!req.table_id) return res.status(400).json({ ok: false });

    await pool.query(
      "UPDATE table_sessions SET is_active=0 WHERE table_id=? AND is_active=1",
      [req.table_id]
    );
    await pool.query(
      "UPDATE tables SET status='ว่าง' WHERE table_id=?",
      [req.table_id]
    );

    res.clearCookie("tsession", {
      httpOnly: true,
      sameSite: "lax",
      secure: IS_PROD,
    });

    res.json({ ok: true });
  } catch (e) {
    console.error("releaseTable error:", e);
    res.status(500).json({ ok: false });
  }
};

/** (optional) export สำหรับ unit test หรือ route debug ภายนอก */
exports.__utils = { sign, verify, buildSignedUrl };
