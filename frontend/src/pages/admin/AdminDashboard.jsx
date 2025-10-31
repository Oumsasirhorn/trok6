// src/pages/admin/AdminReports.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import "./admin.css";

const RAW = import.meta.env.VITE_API_BASE || "http://localhost:5000";
const API = RAW.replace(/[,\s]+$/,'').replace(/\/+$/,'');


export default function AdminReports() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // nav active
  const isDashboard = location.pathname === "/admin";
  const isFoodMenu = location.pathname.startsWith("/admin/menu");
  const isUsers = location.pathname.startsWith("/admin/users");
  const isTables = location.pathname.startsWith("/admin/table");

  /* icons */
function UserTableIcon() { return (<svg viewBox="0 0 24 24"><path d="M3 6h18M3 12h18M3 18h18" /></svg>); }
function MenuIcon() { return (<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h10M4 18h16" /></svg>); }
function UsersIcon() { return (<svg viewBox="0 0 24 24"><path d="M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" /><path d="M3 21c0-4 4-6 8-6" /></svg>); }
function LogoutIcon() { return (<svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>); }
function TablesIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="12" y1="3" x2="12" y2="21" />
    </svg>
  );
}


  // ช่วงเวลา
  const [range, setRange] = useState("day"); // day | week | month

  // KPI state
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [kpi, setKpi] = useState({
    total_sales: 0,
    orders_count: 0,
    items_count: 0,
    avg_order_value: 0,
  });

  // คำนวณช่วง from/to ตามปุ่ม
  const { from, to } = useMemo(() => {
    const pad = (n) => String(n).padStart(2, "0");
    const to = new Date();
    let from = new Date();

    if (range === "day") {
      from.setHours(0, 0, 0, 0);
    } else if (range === "week") {
      from = new Date(to);
      from.setDate(to.getDate() - 6); // 7 วันย้อนหลังรวมวันนี้
      from.setHours(0, 0, 0, 0);
    } else {
      // month: ตั้งแต่วันแรกของเดือนนี้
      from = new Date(to.getFullYear(), to.getMonth(), 1, 0, 0, 0, 0);
    }

    const iso = (d) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return { from: iso(from), to: iso(to) };
  }, [range]);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        setLoading(true); setErr("");
        // แบ็กเอนด์ของคุณรองรับ ?from=YYYY-MM-DD&to=YYYY-MM-DD
        const res = await fetch(
          `${API_BASE}/metrics/sales?from=${from}&to=${to}`,
          { signal: ctrl.signal, headers: { Accept: "application/json" } }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setKpi({
          total_sales: Number(data.total_sales || 0),
          orders_count: Number(data.orders_count || 0),
          items_count: Number(data.items_count || 0),
          avg_order_value: Number(data.avg_order_value || 0),
        });
      } catch (e) {
        if (e.name !== "AbortError") setErr(e.message);
      } finally {
        setLoading(false);
      }
    })();
    return () => ctrl.abort();
  }, [from, to]);

  return (
    <div className="admin-layout">
      {/* ===== Sidebar ===== */}
      <aside className="ad-sidebar">
        <nav className="ad-nav">
          <NavItem icon={UserTableIcon} label="Dashboard" active={isDashboard} onClick={() => navigate("/admin")} />
          <NavItem icon={MenuIcon} label="จัดการเมนูอาหาร" active={isFoodMenu} onClick={() => navigate("/admin/menu")} />
          <NavItem icon={UsersIcon} label="จัดการจอง (Bookings)" active={isUsers} onClick={() => navigate("/admin/users")} />
          <NavItem icon={TablesIcon} label="จัดการ Tables " active={isTables} onClick={() => navigate("/admin/tables")} />
          <NavItem icon={LogoutIcon} label="ออกจากระบบ" onClick={logout} />
        </nav>
      </aside>

      {/* ===== Main ===== */}
      <main className="ad-main rep-surface">
        <header className="ad-header">
          <div className="ad-profile">
            <div className="ad-avatar">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-5 4-7 8-7s8 2 8 7" /></svg>
            </div>
            <h1 className="ad-title">รายงาน & สถิติ</h1>
          </div>

          {/* ช่วงเวลาแบบรูป 2 */}
          <div className="rep-tabs">
            <button
              className={`rep-tab ${range === "day" ? "is-active" : ""}`}
              onClick={() => setRange("day")} type="button">วัน</button>
            <button
              className={`rep-tab ${range === "week" ? "is-active" : ""}`}
              onClick={() => setRange("week")} type="button">สัปดาห์</button>
            <button
              className={`rep-tab ${range === "month" ? "is-active" : ""}`}
              onClick={() => setRange("month")} type="button">เดือน</button>
          </div>
        </header>

        {/* ===== KPI Cards only (สไตล์รูป 2) ===== */}
        <section className="ad-board">
          {err ? (
            <div className="ad-card error">โหลดสรุปล้มเหลว: {err}</div>
          ) : (
            <div className="rep-kpi-grid">
              <KpiCard
                label="ยอดขายรวม"
                value={formatTHB(kpi.total_sales)}
                loading={loading}
              />
              <KpiCard
                label="จำนวนออร์เดอร์"
                value={formatInt(kpi.orders_count)}
                loading={loading}
              />
              <KpiCard
                label="จำนวนรายการ (items)"
                value={formatInt(kpi.items_count)}
                loading={loading}
              />
              <KpiCard
                label="มูลค่าเฉลี่ย/ออร์เดอร์"
                value={formatTHB(kpi.avg_order_value)}
                loading={loading}
              />
            </div>
          )}

          {/* ช่วงวันที่ที่ใช้งานอยู่ */}
          <div className="rep-range-note">
            ช่วงที่แสดงผล: <b>{from}</b> ถึง <b>{to}</b>
          </div>
        </section>
      </main>
    </div>
  );
}

/* ---------- small components ---------- */
function KpiCard({ label, value, loading }) {
  return (
    <div className="rep-card">
      <div className="rep-card__label">{label}</div>
      <div className={`rep-card__value ${loading ? "skeleton" : ""}`}>
        {loading ? <span className="rep-skel-block" /> : value}
      </div>
    </div>
  );
}
function NavItem({ icon: Icon, label, active, onClick }) {
  return (
    <button className={`ad-nav__item ${active ? "is-active" : ""}`} onClick={onClick} type="button">
      <Icon /><span>{label}</span>
    </button>
  );
}

/* ---------- helpers ---------- */
function formatTHB(n) {
  const num = Number(n || 0);
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " บาท";
}
function formatInt(n) {
  return Number(n || 0).toLocaleString();
}
