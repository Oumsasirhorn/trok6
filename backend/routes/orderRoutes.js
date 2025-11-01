// backend/routes/orderRoutes.js
"use strict";

const express = require("express");
const router = express.Router();

const {
  getAllOrders,
  getOrdersByTable,
  createOrder,
  updateOrderStatus,
  payOrder,
  deleteOrder,
} = require("../controllers/orderController");

// 🧷 ใช้ session โต๊ะจากคิวอาร์
const {
  requireTableSession,
} = require("../controllers/qrAuthController");

/* ---------- Middlewares เฉพาะเส้นทางฝั่งลูกค้า (โต๊ะ) ---------- */

/** ใส่ table_id จาก session เข้า req.body/req.params เพื่อให้ controller ใช้ได้เลย */
function injectTableFromSession(req, _res, next) {
  // เผื่อ controller คาดหวัง table_id ใน body
  if (!req.body) req.body = {};
  req.body.table_id = req.table_id;

  // เผื่อ controller คาดหวัง table_id ใน params (ใช้กับ getOrdersByTable แบบ /table/:table_id)
  if (!req.params) req.params = {};
  req.params.table_id = String(req.table_id);

  next();
}

/** กันผู้ใช้ยิง /table/:table_id ไม่ตรงกับ session */
function ensureSameTable(req, res, next) {
  const paramId = Number(req.params.table_id);
  if (!Number.isFinite(paramId)) {
    return res.status(400).json({ error: "BAD_TABLE_ID" });
  }
  if (paramId !== Number(req.table_id)) {
    return res.status(403).json({ error: "FORBIDDEN_DIFFERENT_TABLE" });
  }
  next();
}

/* ---------- Routes ---------- */

/**
 * แอดมินดึงทุกออเดอร์
 * ถ้าต้องการล็อกหลังบ้านภายหลัง ค่อยครอบ middleware auth แอดมินในอนาคต
 */
router.get("/", getAllOrders);

/**
 * ลูกค้าดึงออเดอร์ของ "โต๊ะตัวเอง"
 * - ต้องมี table session
 * - บังคับให้ :table_id ตรงกับ session
 */
router.get(
  "/table/:table_id",
  requireTableSession,
  ensureSameTable,
  getOrdersByTable
);

/**
 * ลูกค้าสร้างออเดอร์ใหม่ (สำหรับโต๊ะตัวเอง)
 * - ต้องมี table session
 * - ยัด table_id จาก session เข้า body ให้ controller เสมอ
 */
router.post(
  "/",
  requireTableSession,
  injectTableFromSession,
  createOrder
);

/**
 * แอดมินอัปเดตสถานะออเดอร์ (เช่น 'รอดำเนินการ' -> 'กำลังทำ' -> 'เสิร์ฟแล้ว')
 * ถ้าต้องการจำกัดสิทธิ์ภายหลัง ให้ครอบด้วย middleware auth แอดมิน
 */
router.put("/:order_id/status", updateOrderStatus);

/**
 * แอดมิน/แคชเชียร์ กดชำระเงินออเดอร์
 * ถ้าต้องการล็อกสิทธิ์ภายหลัง ให้ครอบด้วย middleware auth แอดมินเช่นกัน
 */
router.put("/:order_id/pay", payOrder);

/**
 * ลบออเดอร์ (ควรใช้เฉพาะแอดมิน)
 */
router.delete("/:id", deleteOrder);

module.exports = router;
