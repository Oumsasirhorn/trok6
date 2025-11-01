"use strict";
const express = require("express");
const router = express.Router();

// ใส่เฉพาะ path ที่ขึ้นต้นด้วย "/" เท่านั้น
router.use("/order_items", require("./orderItemRoutes"));
router.use("/orders", require("./orderRoutes"));
router.use("/payments", require("./paymentRoutes"));
router.use("/reservations", require("./reservationRoutes"));
router.use("/tables", require("./tableRoutes"));
router.use("/drinks", require("./drinkRoutes"));
router.use("/snacks", require("./snacksRoutes"));
router.use("/main_dishes", require("./mainDishRoutes"));
router.use("/drink_base_prices", require("./drinkBasePriceRoutes"));
router.use("/bookings", require("./bookingsRoutes"));
router.use("/admins", require("./adminRoutes"));
router.use("/metrics", require("./metricsRoutes"));
router.use("/reports", require("./reportsRoutes"));

// เส้นทาง QR/Validate/Release
router.use("/", require("./qrRoutes"));

module.exports = router;
