// backend/controllers/generateQR.js
"use strict";
const QRCode = require("qrcode");
const Tables = require("../models/tableModel");

/* ===== Config via .env =====
FRONTEND_BASE_URL=https://trok6.vercel.app
QR_TARGET_PATH=/scan                     // หรือ /order
QR_USE_TABLE_ID=0                        // 0=ใช้ ?table=<เลขโต๊ะ>, 1=ใช้ ?tableId=<table_id>
QR_TTL_HOURS=2                           // อายุ QR ชั่วโมง
======================================= */

const FRONTEND = (process.env.FRONTEND_BASE_URL || "http://localhost:5173").replace(/\/+$/, "");
const TARGET_PATH = process.env.QR_TARGET_PATH || "/scan";
const USE_TABLE_ID = String(process.env.QR_USE_TABLE_ID || "0") === "1";
const TTL_HOURS = Number(process.env.QR_TTL_HOURS || 2);

function buildUrl(t) {
  // ถ้าอยากยึดเลขโต๊ะให้คงที่ต่อป้าย → ใช้ ?table=
  // ถ้าอยากยึดตาม table_id → ตั้ง QR_USE_TABLE_ID=1
  const key = USE_TABLE_ID
    ? `tableId=${encodeURIComponent(String(t.table_id))}`
    : `table=${encodeURIComponent(String(t.table_number))}`;

  return `${FRONTEND}${TARGET_PATH}?${key}`;
}

async function generateQRCodeForTable(req, res) {
  try {
    const tableNumber = req.params.tableNumber;
    const t = await Tables.getByNumber(tableNumber); // ต้องมีเมธอดนี้ใน model
    if (!t) return res.status(404).json({ message: "โต๊ะไม่พบ" });

    const url = buildUrl(t);

    // สร้างเป็น Data URL (เลือกใช้ระดับ H + margin ต่ำ, scale พอเหมาะ)
    const qrDataUrl = await QRCode.toDataURL(url, {
      errorCorrectionLevel: "H",
      margin: 1,
      scale: 6,
    });

    const expire = new Date(Date.now() + TTL_HOURS * 60 * 60 * 1000);

    // อัปเดตเฉพาะคอลัมน์ QR
    await Tables.update(t.table_id, {
      qr_code: qrDataUrl,
      qr_expire: expire,
    });

    return res.json({ ok: true, url, qr_code: qrDataUrl, expire });
  } catch (e) {
    console.error("generateQRCodeForTable error:", e);
    return res.status(500).json({ error: e.message });
  }
}

module.exports = { generateQRCodeForTable };
