"use strict";
const Tables = require("../models/tableModel");
const QRCode = require("qrcode");

async function generateQRCodeForTable(req, res) {
  try {
    const tableNumber = req.params.tableNumber;
    const t = await Tables.getByNumber(tableNumber);
    if (!t) return res.status(404).json({ message: "โต๊ะไม่พบ" });

    const url = `http://localhost:5173/order?tableId=${t.table_id}`;
    const qrDataUrl = await QRCode.toDataURL(url);
    const expire = new Date(Date.now() + 2 * 60 * 60 * 1000);

    // อัปเดตแค่ qr_code และ qr_expire เท่านั้น
    await Tables.update(t.table_id, {
      qr_code: qrDataUrl,
      qr_expire: expire
    });

    res.json({ qr_code: qrDataUrl, expire });
  } catch (e) {
    console.error("generateQRCodeForTable error:", e);
    res.status(500).json({ error: e.message });
  }
}

module.exports = { generateQRCodeForTable };
