// src/pages/admin/AdminReports.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import "./admin.css";

/* ================================
   Config
================================ */
const RAW = import.meta.env.VITE_API_BASE || "http://localhost:5000";
const API = RAW.replace(/[,\s]+$/,'').replace(/\/+$/,'');


/* ================================
   Utils
================================ */
const toNum = (v, fb = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
};
const fmt2 = (n) => toNum(n).toFixed(2);

// YYYY-MM-DD (local)
function toYMD(d = new Date()) {
  const dt = new Date(d);
  dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset());
  return dt.toISOString().slice(0, 10);
}
function addDays(d, days) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}
function startOfWeek(d = new Date()) {
  // จันทร์เป็นวันแรกของสัปดาห์
  const day = d.getDay(); // 0=Sun..6=Sat
  const delta = day === 0 ? -6 : 1 - day;
  const s = addDays(d, delta);
  s.setHours(0, 0, 0, 0);
  return s;
}
function startOfMonth(d = new Date()) {
  const s = new Date(d.getFullYear(), d.getMonth(), 1);
  s.setHours(0, 0, 0, 0);
  return s;
}

function getRange(filter) {
  const now = new Date();
  if (filter === "week") {
    const s = startOfWeek(now);
    return { since: toYMD(s), until: toYMD(addDays(s, 7)) };
  }
  if (filter === "month") {
    const s = startOfMonth(now);
    const e = new Date(s.getFullYear(), s.getMonth() + 1, 1);
    return { since: toYMD(s), until: toYMD(e) };
  }
  // day (default)
  const s = new Date(now);
  s.setHours(0, 0, 0, 0);
  const e = addDays(s, 1);
  return { since: toYMD(s), until: toYMD(e) };
}

/* map แถวรีพอร์ตจาก API -> รูปแบบ UI */
function mapReportRow(r) {
  const date =
    r.date || r.day || r.period || r.ymd || r.created_at?.slice(0, 10) || "";
  const item =
    r.item || r.name || r.category || r.title || r.label || "—";

  const income = toNum(
    r.income ?? r.revenue ?? r.total ?? r.amount ?? r.total_price
  );
  const expense = toNum(r.expense ?? r.cost ?? r.outcome ?? 0);
  const profit = toNum(r.profit ?? income - expense);

  return { date, item, income, expense, profit, _raw: r };
}

/* กรณีไม่มี /reports ให้ fallback จาก /orders (สมมุติฟิลด์ทั่วไป) */
function rowsFromOrders(orders = []) {
  // group by YYYY-MM-DD
  const byDate = new Map();
  for (const o of orders) {
    const date =
      o.date ||
      o.created_at?.slice(0, 10) ||
      o.order_date?.slice(0, 10) ||
      "ไม่ทราบวันที่";
    const inc = toNum(o.total ?? o.total_price ?? o.amount ?? 0);
    const exp = toNum(o.expense ?? o.cost ?? 0);
    const key = date;
    if (!byDate.has(key)) byDate.set(key, { income: 0, expense: 0 });
    const agg = byDate.get(key);
    agg.income += inc;
    agg.expense += exp;
  }
  const rows = [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, v]) =>
      mapReportRow({
        date,
        item: "สรุปต่อวัน",
        income: v.income,
        expense: v.expense,
        profit: v.income - v.expense,
      })
    );
  return rows;
}

export default function AdminReports() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sp, setSp] = useSearchParams();

  const [filter, setFilter] = useState(sp.get("range") || "day"); // day | week | month
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({ income: 0, expense: 0, profit: 0 });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const q = sp.get("q") || "";

  // active menu
  const isDashboard = location.pathname === "/admin";
  const isMenu = location.pathname.startsWith("/admin/menu");
  const isResv = location.pathname.startsWith("/admin/reservations"); // ปรับตามโปรเจกต์ได้
  const isReports = location.pathname.startsWith("/admin/reports");



  // ดึงข้อมูลรีพอร์ต (ลอกสไตล์เดียวกับ AdminReservations)
  useEffect(() => {
    let ignore = false;

    async function fetchReports() {
      setLoading(true);
      setErr("");
      try {
        const { since, until } = getRange(filter);

        // 1) พยายามเรียก API แบบเป็นรีพอร์ตโดยตรง
        const tryEndpoints = [
          `${API_BASE}/reports?range=${encodeURIComponent(
            filter
          )}&since=${since}&until=${until}`,
          `${API_BASE}/orders/report?range=${encodeURIComponent(
            filter
          )}&since=${since}&until=${until}`,
        ];

        let ok = false;
        for (const url of tryEndpoints) {
          try {
            const res = await fetch(url);
            if (!res.ok) continue;
            const data = await res.json();

            // รูปแบบที่คาดหวัง: { summary: {...}, rows: [...] }
            const s = data?.summary || {};
            const r = Array.isArray(data?.rows) ? data.rows : Array.isArray(data) ? data : [];
            const mapped = r.map(mapReportRow);

            const sum =
              mapped.length > 0
                ? mapped.reduce(
                  (acc, x) => {
                    acc.income += x.income;
                    acc.expense += x.expense;
                    acc.profit += x.profit;
                    return acc;
                  },
                  { income: 0, expense: 0, profit: 0 }
                )
                : { income: 0, expense: 0, profit: 0 };

            if (!ignore) {
              setRows(mapped);
              setSummary({
                income: toNum(s.income ?? sum.income),
                expense: toNum(s.expense ?? sum.expense),
                profit: toNum(s.profit ?? sum.profit),
              });
            }
            ok = true;
            break;
          } catch {
            // ลอง endpoint ถัดไป
          }
        }

        if (!ok) {
          // 2) fallback: ดึงออเดอร์ดิบ แล้วคำนวณเอง
          const url = `${API_BASE}/orders?since=${since}&until=${until}`;
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const orders = await res.json();
          const mapped = rowsFromOrders(Array.isArray(orders) ? orders : []);
          const sum =
            mapped.length > 0
              ? mapped.reduce(
                (acc, x) => {
                  acc.income += x.income;
                  acc.expense += x.expense;
                  acc.profit += x.profit;
                  return acc;
                },
                { income: 0, expense: 0, profit: 0 }
              )
              : { income: 0, expense: 0, profit: 0 };
          if (!ignore) {
            setRows(mapped);
            setSummary(sum);
          }
        }
      } catch (e) {
        if (!ignore) {
          setRows([]);
          setSummary({ income: 0, expense: 0, profit: 0 });
          setErr(`โหลดรายงานล้มเหลว: ${e.message}`);
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    fetchReports();
    return () => {
      ignore = true;
    };
  }, [filter]);

  // ค้นหาในตาราง
  const filtered = useMemo(() => {
    if (!q) return rows;
    const s = q.toLowerCase();
    return rows.filter(
      (r) =>
        (r.date || "").toLowerCase().includes(s) ||
        (r.item || "").toLowerCase().includes(s)
    );
  }, [rows, q]);

  // สำหรับกราฟแท่งง่ายๆ จาก rows ปัจจุบัน
  const chartData = useMemo(() => {
    // เอา top 10 ล่าสุดพอ (ลด render หนัก)
    const last = [...rows].slice(-10);
    const max = Math.max(1, ...last.map((x) => x.income));
    return last.map((x) => ({
      label: x.date?.slice(5) || "",
      value: x.income,
      pct: (x.income / max) * 100,
    }));
  }, [rows]);

  // handlers
  const onRange = (r) => {
    setFilter(r);
    setSp((prev) => {
      const next = new URLSearchParams(prev);
      next.set("range", r);
      return next;
    });
  };
  const onSearch = (e) => {
    setSp((prev) => {
      const next = new URLSearchParams(prev);
      const v = e.target.value || "";
      if (v) next.set("q", v);
      else next.delete("q");
      return next;
    });
  };

  return (
    <div className="admin-layout">
      {/* Sidebar */}
      <aside className="ad-sidebar">
        <nav className="ad-nav">
          <NavItem
            icon={UserTableIcon}
            label="จัดการโต๊ะ"
            active={isTables}
            onClick={() => navigate("/admin")}
          />
          <NavItem
            icon={MenuIcon}
            label="จัดการเมนูอาหาร"
            active={isMenu}
            onClick={() => navigate("/admin/menu")}
          />
          <NavItem
            icon={UsersIcon}
            label="จัดการการจอง (Bookings)"
            active={isResv}
            onClick={() => navigate("/admin/reservations")}
          />
          <NavItem
            icon={ChartIcon}
            label="รายงาน & สถิติ"
            active={isReports}
            onClick={() => navigate("/admin/reports")}
          />
          <NavItem icon={LogoutIcon} label="ออกจากระบบ" onClick={logout} />
        </nav>
      </aside>

      {/* Main */}
      <main className="ad-main">
        <header className="ad-header">
          <div className="ad-profile">
            <div className="ad-avatar">
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c0-5 4-7 8-7s8 2 8 7" />
              </svg>
            </div>
            <h1 className="ad-title">รายงาน & สถิติ</h1>
          </div>

          <div className="ad-actions">
            <input
              className="input"
              placeholder="ค้นหา (วันที่/รายการ)"
              value={q}
              onChange={onSearch}
              style={{ width: 260 }}
            />
          </div>
        </header>

        <section className="ad-board">
          {loading && <div className="loading">กำลังโหลด...</div>}
          {err && !loading && <div className="error">{err}</div>}

          {/* Summary cards */}
          <div className="report-summary">
            <div className="summary-card">
              <h3>รายรับ</h3>
              <p>{fmt2(summary.income)}</p>
            </div>
            <div className="summary-card">
              <h3>รายจ่าย</h3>
              <p>{fmt2(summary.expense)}</p>
            </div>
            <div className="summary-card">
              <h3>กำไร/ขาดทุน</h3>
              <p>{fmt2(summary.profit)}</p>
            </div>
          </div>

          {/* Filters */}
          <div className="report-filters">
            <button
              className={`ad-chip ${filter === "day" ? "ad-chip--primary" : ""}`}
              onClick={() => onRange("day")}
              type="button"
            >
              วัน
            </button>
            <button
              className={`ad-chip ${filter === "week" ? "ad-chip--primary" : ""}`}
              onClick={() => onRange("week")}
              type="button"
            >
              สัปดาห์
            </button>
            <button
              className={`ad-chip ${filter === "month" ? "ad-chip--primary" : ""}`}
              onClick={() => onRange("month")}
              type="button"
            >
              เดือน
            </button>
          </div>

          {/* Chart (CSS bar) */}
          <div className="ad-card">
            <div className="report-chart" style={{ padding: 16 }}>
              {chartData.length === 0 ? (
                <div className="muted">ยังไม่มีข้อมูลสำหรับแสดงกราฟ</div>
              ) : (
                <div className="bars" style={{ display: "flex", gap: 8, alignItems: "end", height: 160 }}>
                  {chartData.map((b, i) => (
                    <div key={i} style={{ flex: 1, textAlign: "center" }}>
                      <div
                        style={{
                          height: `${Math.max(4, b.pct)}%`,
                          borderRadius: 6,
                          background: "var(--brand-700, #a27396)",
                          transition: "height .3s",
                        }}
                        title={`${b.label}: ${fmt2(b.value)}`}
                      />
                      <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>{b.label}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="ad-card">
            <table className="ad-table">
              <thead>
                <tr>
                  <th>วัน/เดือน/ปี</th>
                  <th>รายการ</th>
                  <th>รายรับ</th>
                  <th>รายจ่าย</th>
                  <th>กำไรขาดทุน</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      ไม่มีข้อมูล
                    </td>
                  </tr>
                ) : (
                  filtered.map((r, i) => (
                    <tr key={i}>
                      <td>{r.date}</td>
                      <td>{r.item}</td>
                      <td>{fmt2(r.income)}</td>
                      <td>{fmt2(r.expense)}</td>
                      <td>{fmt2(r.profit)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

/* ---------- icons & nav ---------- */
function NavItem({ icon: Icon, label, active, onClick }) {
  return (
    <button
      className={`ad-nav__item ${active ? "is-active" : ""}`}
      onClick={onClick}
      type="button"
    >
      <Icon />
      <span>{label}</span>
    </button>
  );
}
function UserTableIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  );
}
function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M4 6h16M4 12h10M4 18h16" />
    </svg>
  );
}
function UsersIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" />
      <path d="M3 21c0-4 4-6 8-6" />
    </svg>
  );
}
function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M4 20V6M10 20V10M16 20V4M22 20H2" />
    </svg>
  );
}
function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}
