"use strict";
const express = require("express");
const router = express.Router();
const QR = require("../controllers/qrAuthController");

router.get("/qr/:tableNumber.png", QR.generateSignedQR);
router.get("/api/qr/validate", QR.validateAndCreateSession);
router.post("/api/tables/release", QR.requireTableSession, QR.releaseTable);

module.exports = router;
