// backend/routes/index.js
"use strict";
const express = require("express");
const router = express.Router();

router.use("/order_items", require("./orderItemRoutes"));
router.use("/orders", require("./orderRoutes"));
router.use("/payments", require("./paymentRoutes"));
router.use("/reservations", require("./reservationRoutes"));
router.use("/tables", require("./tableRoutes"));
router.use("/drinks", require("./drinkRoutes"));
router.use("/snacks", require("./snacksRoutes"));
router.use("/main_dishes", require("./mainDishRoutes"));
router.use("/drink_base_prices", require("./drinkBasePriceRoutes"));
router.use("/bookings", require("./bookingsRoutes")); // 👈 เพิ่มไว้ตรงนี้
router.use("/admins", require("./adminRoutes"));
router.use("/metrics", require("./metricsRoutes"));

router.use("/", require("./qrRoutes"));  // 👈 เพิ่มบรรทัดนี้
const reportsRoutes = require('./reportsRoutes');
router.use("/reports", reportsRoutes);


module.exports = router;
