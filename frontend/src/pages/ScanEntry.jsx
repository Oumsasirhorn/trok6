// src/pages/ScanEntry.jsx
import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

/**
 * ใช้เมื่อสแกน QR: รับ ?table= หรือ ?tableId=
 * - เก็บค่าไว้ใน localStorage (หรือ Context ได้)
 * - จากนั้นพาไปหน้าเมนูที่ต้องการ เช่น /foods หรือ /drinks
 */
export default function ScanEntry() {
  const [sp] = useSearchParams();
  const nav = useNavigate();

  // รองรับทั้ง ?table (เลขโต๊ะ) และ ?tableId (id ใน DB)
  const table = sp.get("table");
  const tableId = sp.get("tableId");

  useEffect(() => {
    // ต้องมีอย่างใดอย่างหนึ่ง
    if (!table && !tableId) {
      // ไม่พบพารามิเตอร์ → พากลับหน้าแรก
      nav("/", { replace: true });
      return;
    }

    if (table) localStorage.setItem("active_table", table);
    if (tableId) localStorage.setItem("active_table_id", tableId);

    // 👉 เลือกปลายทางหลังสแกน: จะไป /foods หรือ /drinks ก็ได้
    nav("/foods", { replace: true });
  }, [table, tableId, nav]);

  return (
    <div style={{ padding: 24 }}>
      <p>กำลังเตรียมหน้าเมนูสำหรับโต๊ะ {table || tableId || "-"} ...</p>
    </div>
  );
}
