// utils/qr.js
const FRONTEND = (process.env.FRONTEND_BASE_URL || "http://localhost:5173").replace(/\/+$/, "");

exports.urlForTable = (tableNumber) => {
  const n = encodeURIComponent(String(tableNumber));
  // ถ้าจะใช้ /order ก็เปลี่ยน scan เป็น order ได้
  return `${FRONTEND}/scan?table=${n}`;
};
