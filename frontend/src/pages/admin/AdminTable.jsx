// src/pages/admin/AdminTable.jsx
import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import "./admin.css";

const RAW = import.meta.env.VITE_API_BASE || "http://localhost:5000";
const API = RAW.replace(/[,\s]+$/, "").replace(/\/+$/, "");
// ใช้ `${API}/...` เสมอ

const ZONES = ["โซนในร้าน", "โซนนอกร้าน"];
const INSIDE_MAX = 18;

// เราเหลือแค่ 2 สถานะเท่านั้น
const STATUS = {
  FREE: "ว่าง",
  BUSY: "กำลังใช้งาน",
};

function deriveZoneFromLabel(label = "") {
  const m = String(label).match(/(\d+)/);
  const n = m ? Number(m[1]) : NaN;
  if (Number.isNaN(n)) return "โซนในร้าน";
  return n <= INSIDE_MAX ? "โซนในร้าน" : "โซนนอกร้าน";
}

export default function AdminTable() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sp] = useSearchParams();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tables, setTables] = useState([]);
  const [selected, setSelected] = useState(null);
  const [zone, setZone] = useState("โซนในร้าน");
  const [highlight, setHighlight] = useState(sp.get("highlight") || "");

  // UI states
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // all | free | busy
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);

  const isDashboard = location.pathname === "/admin";
  const isMenu = location.pathname.startsWith("/admin/menu");
  const isBookings = location.pathname.startsWith("/admin/users");
  const isTable = location.pathname.startsWith("/admin/tables");

  // ดึงโต๊ะ + normalize สถานะให้เหลือแค่ ว่าง/กำลังใช้งาน
  const fetchTables = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`${API_BASE}/tables`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();

      const normalized = (Array.isArray(data) ? data : []).map((t) => {
        // ถ้า backend ยังมี "จองแล้ว" ให้ถือว่าเป็น "กำลังใช้งาน"
        const raw = String(t.status || "").trim();
        const status =
          raw === STATUS.FREE ? STATUS.FREE : STATUS.BUSY;

        return {
          id: t.table_id,
          number: t.table_number || `T${t.table_id}`,
          status,
          zone:
            t.zone && t.zone.trim() !== ""
              ? t.zone.trim()
              : deriveZoneFromLabel(t.table_number || ""),
        };
      });

      const ordered = normalized.sort((a, b) => {
        const na = Number(a.number.match(/\d+/)?.[0] ?? 1e9);
        const nb = Number(b.number.match(/\d+/)?.[0] ?? 1e9);
        return na - nb;
      });

      setTables(ordered);
    } catch (e) {
      setError(e.message || "โหลดข้อมูลโต๊ะไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTables(); }, [fetchTables]);

  // Auto refresh
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => setRefreshTick((t) => t + 1), 15000);
    return () => clearInterval(id);
  }, [autoRefresh]);

  useEffect(() => { if (autoRefresh) fetchTables(); }, [refreshTick, autoRefresh, fetchTables]);

  // clear highlight
  useEffect(() => {
    if (!highlight) return;
    const t = setTimeout(() => setHighlight(""), 2500);
    return () => clearTimeout(t);
  }, [highlight]);

  // ตารางตามโซน
  const zoneTables = useMemo(
    () => tables.filter((t) => t.zone?.trim() === zone.trim()),
    [tables, zone]
  );

  // ค้นหา + กรองสถานะ
  const visibleTables = useMemo(() => {
    const q = query.trim().toLowerCase();
    return zoneTables.filter((t) => {
      const matchText = !q || t.number.toLowerCase().includes(q);
      const matchStatus =
        statusFilter === "all" ||
        (statusFilter === "free" && t.status === STATUS.FREE) ||
        (statusFilter === "busy" && t.status === STATUS.BUSY);
      return matchText && matchStatus;
    });
  }, [zoneTables, query, statusFilter]);

  const countAll = visibleTables.length;
  const countBusy = visibleTables.filter((t) => t.status === STATUS.BUSY).length;
  const countFree = visibleTables.filter((t) => t.status === STATUS.FREE).length;

  useEffect(() => {
    if (selected && !visibleTables.some((t) => t.number === selected)) setSelected(null);
  }, [zone, visibleTables, selected]);

  const onPick = (t) => {
    // เลือกได้หมด (ไม่มีอนุมัติ/ปฏิเสธแล้ว)
    setSelected((p) => (p === t.number ? null : t.number));
  };

  // ฟังก์ชันสลับสถานะ (ว่าง <-> กำลังใช้งาน)
  const updateStatus = async (number, nextStatus) => {
    try {
      // ต้องมี endpoint นี้ใน backend: POST /tables/:number/status  { status: "ว่าง" | "กำลังใช้งาน" }
      const res = await fetch(`${API_BASE}/tables/${number}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchTables();
      setHighlight(number);
    } catch (e) {
      alert("Update status failed: " + e.message);
    }
  };

  return (
    <div className="admin-layout">
      {/* Sidebar */}
      <aside className="ad-sidebar">
        <nav className="ad-nav">
          <NavItem icon={DashIcon} label="Dashboard" active={isDashboard} onClick={() => navigate("/admin")} />
          <NavItem icon={MenuIcon} label="จัดการเมนูอาหาร" active={isMenu} onClick={() => navigate("/admin/menu")} />
          <NavItem icon={UsersIcon} label="จัดการจอง (Bookings)" active={isBookings} onClick={() => navigate("/admin/users")} />
          <NavItem icon={TablesIcon} label="จัดการ Tables" active={isTable} onClick={() => navigate("/admin/tables")} />
          <NavItem icon={LogoutIcon} label="ออกจากระบบ" onClick={logout} />
        </nav>
      </aside>

      {/* Main */}
      <main className="ad-main">
        <header className="bk-titlebar bk-titlebar--row">
          <div>
            <h1>จัดการโต๊ะ</h1>
          
          </div>
          <div className="bk-actions">
            <button className="btn btn-secondary" type="button" onClick={() => fetchTables()}>
              <RefreshIcon /> <span>รีเฟรช</span>
            </button>
            <label className="toggle">
              <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
              <span>Auto-refresh</span>
            </label>
          </div>
        </header>

        {/* Toolbar */}
        <section className="bk-toolbar">
          {/* กล่องโค้งยาวของปุ่มโซน (ซ้าย) */}
          <div className="zone-group">
            <div className="zone-scroll">
              {ZONES.map((z) => (
                <button
                  key={z}
                  className={`pill pill--navy ${zone === z ? "is-active" : ""}`}
                  onClick={() => setZone(z)}
                  type="button"
                  role="tab"
                  aria-selected={zone === z}
                >
                  <span className="dot" aria-hidden="true" />
                  {z}
                </button>
              ))}
            </div>
          </div>

          {/* ค้นหา + ชิป (ขวา) */}
          <div className="right-tools">
            <div className="bk-search">
              <span className="lens-dot" aria-hidden="true" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ค้นหาเลขโต๊ะ เช่น 12 หรือ T12"
                aria-label="ค้นหาเลขโต๊ะ"
              />
              {query && (
                <button className="clear" onClick={() => setQuery("")} type="button" aria-label="ล้างคำค้น">×</button>
              )}
            </div>

            <div className="bk-status-filter" role="group" aria-label="ตัวกรองสถานะ">
              <button
                className={`chip ${statusFilter === "all" ? "is-active" : ""}`}
                onClick={() => setStatusFilter("all")}
                type="button"
              >
                ทั้งหมด <span className="count">{countAll}</span>
              </button>
              <button
                className={`chip ${statusFilter === "free" ? "is-active free" : ""}`}
                onClick={() => setStatusFilter("free")}
                type="button"
              >
                ว่าง <span className="count">{countFree}</span>
              </button>
              <button
                className={`chip ${statusFilter === "busy" ? "is-active busy" : ""}`}
                onClick={() => setStatusFilter("busy")}
                type="button"
              >
                กำลังใช้งาน <span className="count">{countBusy}</span>
              </button>
            </div>
          </div>
        </section>

     

        {/* Stats */}
        <section className="bk-stats bk-stats--pretty" aria-label="สรุปจำนวนโต๊ะ">
          <Stat label="ทั้งหมด" value={countAll} />
          <Stat label="ว่าง" value={countFree} tone="free" />
          <Stat label="กำลังใช้งาน" value={countBusy} tone="busy" />
        </section>

        {/* Grid */}
        <section className="bk-map">
          {loading && (
            <div className="bk-loading">
              <div className="shimmer" />
              กำลังโหลดโต๊ะ…
            </div>
          )}
          {error && <div className="bk-error">{error}</div>}

          {!loading && !error && (
            <div className="seat-grid seat-grid--cards" role="list" aria-label={`ผังโต๊ะ (${zone})`}>
              {visibleTables.map((t) => {
                const isHL = highlight && t.number === highlight;
                const isSel = selected === t.number;
                const statusTone = t.status === STATUS.BUSY ? "busy" : "free";

                return (
                  <article
                    key={t.id}
                    className={[
                      "seat-card",
                      `seat--${statusTone}`,
                      isSel ? "is-selected" : "",
                      isHL ? "is-hl" : "",
                    ].join(" ")}
                    role="listitem"
                    aria-label={`โต๊ะ ${t.number} สถานะ ${t.status}`}
                  >
                    <header className="seat-card__head">
                      <div className="seat-card__id">
                        <span className="seat-number">{t.number}</span>
                        <span className={`status-badge status-badge--${statusTone}`}>{t.status}</span>
                      </div>
                      <button
                        className="ghost"
                        type="button"
                        title="เลือกโต๊ะ"
                        onClick={() => onPick(t)}
                      >
                        <SelectIcon />
                      </button>
                    </header>

                 
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

/* ---------- Reusable ---------- */
function NavItem({ icon: Icon, label, active, onClick }) {
  return (
    <button className={`ad-nav__item ${active ? "is-active" : ""}`} onClick={onClick} type="button">
      <Icon />
      <span>{label}</span>
    </button>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className={`stat pretty ${tone ? `tone-${tone}` : ""}`}>
      <div className="stat__label">{label}</div>
      <div className="stat__value">{value}</div>
    </div>
  );
}

/* ---------- Icons ---------- */
const icon = (d) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d={d} />
  </svg>
);
function DashIcon() { return icon("M3 6h18M3 12h18M3 18h18"); }
function MenuIcon() { return icon("M4 6h16M4 12h10M4 18h16"); }
function UsersIcon(){ return icon("M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z M3 21c0-4 4-6 8-6"); }
function LogoutIcon(){ return icon("M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9"); }
function RefreshIcon(){ return icon("M21 12a9 9 0 1 1-2.64-6.36L21 8 M21 4v4h-4"); }
function SelectIcon(){ return icon("M7 12l3 3 7-7"); }
function TablesIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="12" y1="3" x2="12" y2="21" />
    </svg>
  );
}
