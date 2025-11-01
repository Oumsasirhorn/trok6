"use strict";
const express = require("express");
const router = express.Router();
const QR = require("../controllers/qrAuthController");

// QR image: จำกัดรูปแบบ tableNumber เพื่อกัน regex พัง
router.get("/qr/:tableNumber([A-Za-z0-9_-]{1,20}).png", QR.generateSignedQR);

// ยืนยันสิทธิ์โต๊ะจากลิงก์ใน QR
router.get("/api/qr/validate", QR.validateAndCreateSession);

// ปล่อยโต๊ะ (ต้องมี session)
router.post("/api/tables/release", QR.requireTableSession, QR.releaseTable);

module.exports = router;
