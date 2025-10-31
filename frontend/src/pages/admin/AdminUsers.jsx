// src/pages/admin/AdminBookings.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import "./admin.css";

const RAW = import.meta.env.VITE_API_BASE || "http://localhost:5000";
const API = RAW.replace(/[,\s]+$/, "").replace(/\/+$/, "");
// ใช้ `${API}/...` เสมอ


const icon = (d) => (<svg viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>);
function DashIcon() { return icon("M3 6h18M3 12h18M3 18h18"); }
function MenuIcon() { return icon("M4 6h16M4 12h10M4 18h16"); }
function UsersIcon() { return icon("M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z M3 21c0-4 4-6 8-6"); }
function LogoutIcon() { return icon("M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9"); }
function TablesIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="12" y1="3" x2="12" y2="21" />
    </svg>
  );
}

function NavItem({ icon: Icon, label, active, onClick }) {
  return (
    <button className={`ad-nav__item ${active ? "is-active" : ""}`} onClick={onClick} type="button">
      <Icon /><span>{label}</span>
    </button>
  );
}

const TH_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const toThaiDate = (iso) => (!iso ? "-" : (() => { const [y, m, d] = iso.split("-").map(v => parseInt(v, 10)); return y && m && d ? `${d} ${TH_MONTHS[m - 1]} ${y}` : iso; })());
const toThaiTime = (hhmm) => (!hhmm ? "-" : (() => { const [h, m] = hhmm.split(":"); return `${h}.${m}`; })());

const ZONE_TH = { in: "โซนในร้าน", out: "โซนนอกร้าน" };
const STATUS_TH = { pending: "ค้าง", confirmed: "อนุมัติแล้ว", cancelled: "ปฏิเสธแล้ว", seated: "นั่งแล้ว", done: "เสร็จสิ้น" };

function mapBooking(r) {
  const dt = r.datetime ?? r.date_time ?? null;
  const dateFromDT = dt ? String(dt).slice(0, 10) : "";
  const timeFromDT = dt ? String(dt).slice(11, 16) : "";

  const table = String(r.table_no ?? r.table_number ?? r.table ?? r.table_id ?? "");
  const zone = String(r.zone ?? r.area ?? "").toLowerCase();

  return {
    id: r.booking_id ?? r.id ?? r._id ?? String(Math.random()),
    customer_name: r.customer_name ?? r.name ?? "",
    phone: r.phone ?? r.tel ?? "",
    table,
    zone,
    date: r.date ?? dateFromDT,
    time: r.time ?? timeFromDT,
    time_end: r.time_end ?? r.end_time ?? "",
    guests: Number.isFinite(Number(r.guests ?? r.party_size)) ? Number(r.guests ?? r.party_size) : 1,
    status: r.status ?? "pending",
    note: r.note ?? r.notes ?? "",
    slip_path: r.slip_path ?? r.slip_url ?? r.slip ?? null,
    _raw: r,
  };
}

function slipSrc(b) {
  const raw = b?._raw ?? {};
  const blob = raw.slip_blob;
  const mime = raw.slip_mime || "image/png";
  if (blob) return `data:${mime};base64,${blob}`;
  const p = b?.slip_path;
  if (typeof p === "string" && p.length > 0) {
    if (/^https?:\/\//i.test(p)) return p;
    return `${API_BASE}${p.startsWith("/") ? "" : "/"}${p}`;
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><rect width='100%' height='100%' fill='#eee'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='monospace' font-size='28' fill='#555'>QR</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export default function AdminBookings() {
  const { admin, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const tab = searchParams.get("tab") || "pending";
  const [currentIndex, setCurrentIndex] = useState(0);
  const [toast, setToast] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);   // 🔒 กันการกดซ้ำ

  const showToast = (text, type = "ok") => { setToast({ text, type }); setTimeout(() => setToast(null), 1600); };

  const isDashboard = location.pathname === "/admin";
  const isMenu = location.pathname.startsWith("/admin/menu");
  const isBookings = location.pathname.startsWith("/admin/user");
  const isTable = location.pathname.startsWith("/admin/tables");

  useEffect(() => {
    let ignore = false; (async () => {
      setLoading(true); setErr("");
      try {
        const res = await fetch(`${API_BASE}/bookings`, { headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const list = (Array.isArray(data) ? data : []).map(mapBooking);
        if (!ignore) { setRows(list); setCurrentIndex(0); }
      } catch (e) { if (!ignore) { setErr(`โหลดข้อมูลล้มเหลว: ${e.message}`); setRows([]); } }
      finally { if (!ignore) setLoading(false); }
    })(); return () => { ignore = true };
  }, []);

  const filtered = useMemo(() => {
    if (tab === "pending") return rows.filter(r => r.status === "pending");
    if (tab === "confirmed") return rows.filter(r => r.status === "confirmed");
    return rows;
  }, [rows, tab]);

  async function updateStatus(id, status, tableNoFromUI) {
    if (actionBusy) return;
    const prev = rows;
    setRows(p => p.map(x => x.id === id ? { ...x, status } : x));   // optimistically update
    setActionBusy(true);
    try {
      const res = await fetch(`${API_BASE}/bookings/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const t = data?.table_no || tableNoFromUI || "";

      if (status === "confirmed" && t) {
        return;
      }
      showToast("อัปเดตสถานะแล้ว", "ok");
    } catch (e) {
      setRows(prev);                         // rollback
      showToast(`อัปเดตไม่สำเร็จ: ${e.message}`, "err");
    } finally {
      setActionBusy(false);
    }
  }

  const b = filtered[currentIndex] || null;
  const setTab = (t) => { setSearchParams({ tab: t }); setCurrentIndex(0); };

  const canAct = b && b.status === "pending";

  return (
    <div className="admin-layout">
      <aside className="ad-sidebar">
        <div className="ad-brand">
          <div className="hamburger" aria-hidden />
          <div className="brand-text"></div>
        </div>
        <nav className="ad-nav">
          <NavItem icon={DashIcon} label="Dashboard" active={isDashboard} onClick={() => navigate("/admin")} />
          <NavItem icon={MenuIcon} label="จัดการเมนูอาหาร" active={isMenu} onClick={() => navigate("/admin/menu")} />
          <NavItem icon={UsersIcon} label="จัดการจอง (Bookings)" active={isBookings} onClick={() => navigate("/admin/bookings")} />
          <NavItem icon={TablesIcon} label="จัดการ Tables" active={isTable} onClick={() => navigate("/admin/tables")} />

          <NavItem icon={LogoutIcon} label="ออกจากระบบ" onClick={logout} />
        </nav>
      </aside>


      <main className="ad-main">
        <header className="ad-header">
          <div className="ad-profile">
            <div className="ad-avatar">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-5 4-7 8-7s8 2 8 7" /></svg>
            </div>
            <div className="ad-user"><div className="ad-user__name">แอดมิน {admin?.username || "ปลาเผา"}</div></div>
          </div>

          <div className="ad-chipbar">
            <button className={`chip ${tab === "pending" ? "is-active" : ""}`} onClick={() => setTab("pending")} type="button">ค้าง</button>
            <button className={`chip ${tab === "confirmed" ? "is-active" : ""}`} onClick={() => setTab("confirmed")} type="button">อนุมัติ</button>
            <button className="chip ghost" onClick={() => setTab("all")} type="button">ทั้งหมด</button>
          </div>
        </header>

        <section className="ad-board">
          {toast && <div className={`ad-toast ${toast.type === "ok" ? "ok" : "err"}`}>{toast.text}</div>}
          {loading && <div className="loading">กำลังโหลด...</div>}
          {err && !loading && <div className="error">{err}</div>}

          <div className="ad-card detail-card">
            {!b ? (
              <div className="muted" style={{ padding: 16 }}>ไม่มีรายการในแท็บนี้</div>
            ) : (
              <div className="detail-grid">
                <div className="detail-text">
                  <div className="detail-row">
                    <div className="detail-title">
                      โต๊ะ: {b.table || "-"}{b.zone ? ` (${ZONE_TH[b.zone] || b.zone})` : ""}
                      {/* แสดงป้ายสถานะเล็ก ๆ */}
                      <span className={`status-chip s-${b.status}`} style={{ marginLeft: 8 }}>
                        {STATUS_TH[b.status] || b.status}
                      </span>
                    </div>
                  </div>

                  <div className="detail-row"><div className="label">ชื่อผู้จอง :</div><div className="value strong">{b.customer_name || "-"}</div></div>
                  <div className="detail-row"><div className="label">วันที่จอง :</div><div className="value">{toThaiDate(b.date)}</div></div>
                  <div className="detail-row">
                    <div className="label">เวลาจอง :</div>
                    <div className="value">{b.time_end ? `${toThaiTime(b.time)}-${toThaiTime(b.time_end)}` : `${toThaiTime(b.time)}`}</div>
                  </div>
                  <div className="detail-row"><div className="label">สลิปการชำระเงิน :</div></div>
                </div>

                <div className="slip-box" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  {slipSrc(b) && <img src={slipSrc(b)} alt="สลิป" style={{ marginBottom: 8, maxWidth: "100%" }} />}

                  {/* QR code */}
                  {b?.qr_code && (
                    <>
                      <img src={b.qr_code} alt="QR code" style={{ marginBottom: 8, maxWidth: "220px" }} />
                      <a
                        href={b.qr_code}
                        download={`QR_Table_${b.table}.png`}
                        className="btn-download"
                        style={{ padding: "6px 12px", background: "#4caf50", color: "#fff", borderRadius: "4px", textDecoration: "none" }}
                      >
                        ดาวน์โหลด QR
                      </a>
                    </>
                  )}
                </div>

                {/* ✅ ปุ่มจะแสดงเฉพาะตอน pending */}
                {canAct ? (
                  <div className="detail-actions">
                    <button
                      className="btn-approve"
                      disabled={actionBusy}
                      onClick={async () => {
                        if (!confirm(`ยืนยันอนุมัติการจองโต๊ะ ${b.table}?`)) return;

                        setActionBusy(true);

                        try {
                          // 1️⃣ เรียก API decision เพื่อรับ QR code และ zone
                          const res = await fetch(`${API_BASE}/tables/${b.table}/decision`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ action: "approve" })
                          });
                          if (!res.ok) throw new Error(`HTTP ${res.status}`);
                          const data = await res.json();

                          // 2️⃣ อัปเดต status ผ่าน updateStatus
                          await updateStatus(b.id, "confirmed", b.table);

                          // 3️⃣ อัปเดต QR code และ zone ใน UI
                          setRows(prev => prev.map(r =>
                            r.id === b.id
                              ? {
                                ...r,
                                qr_code: data.qr_code,      // QR code จาก API
                                zone: data.zone || r.zone   // zone ใหม่ถ้ามี
                              }
                              : r
                          ));

                          showToast("อนุมัติโต๊ะเรียบร้อยแล้ว");
                        } catch (e) {
                          console.error("onApproveTable error:", e);
                          showToast(`อนุมัติล้มเหลว: ${e.message}`, "err");
                        } finally {
                          setActionBusy(false);
                        }
                      }}
                      type="button"
                    >
                      {actionBusy ? "กำลังบันทึก..." : "อนุมัติ"}
                    </button>



                    <button
                      className="btn-reject"
                      disabled={actionBusy}
                      onClick={async () => {
                        if (!confirm(`ยืนยันปฏิเสธการจองโต๊ะ ${b.table}?`)) return;

                        setActionBusy(true);

                        try {
                          // 1️⃣ เรียก API decision เพื่อปฏิเสธโต๊ะ
                          const res = await fetch(`${API_BASE}/tables/${b.table}/decision`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ action: "reject" })
                          });
                          if (!res.ok) throw new Error(`HTTP ${res.status}`);
                          const data = await res.json();

                          // 2️⃣ อัปเดต status ผ่าน updateStatus
                          await updateStatus(b.id, "cancelled", b.table);

                          // 3️⃣ อัปเดต QR code และ zone ใน UI (กรณีปฏิเสธ จะลบ QR code)
                          setRows(prev => prev.map(r =>
                            r.id === b.id ? { ...r, qr_code: null, zone: data.zone || r.zone } : r
                          ));

                          showToast("ปฏิเสธโต๊ะเรียบร้อยแล้ว");
                        } catch (e) {
                          console.error("onRejectTable error:", e);
                          showToast(`ปฏิเสธล้มเหลว: ${e.message}`, "err");
                        } finally {
                          setActionBusy(false);
                        }
                      }}
                      type="button"
                    >
                      {actionBusy ? "กำลังบันทึก..." : "ปฏิเสธ"}
                    </button>

                  </div>
                ) : (
                  <div className="detail-actions muted">
                    <span className="hint">รายการนี้{STATUS_TH[b.status] || b.status}</span>
                  </div>
                )}

              </div>
            )}
          </div>

          <div className="pager">
            <button className="pager-btn" disabled={currentIndex <= 0} onClick={() => setCurrentIndex(i => Math.max(0, i - 1))} type="button">← ก่อนหน้า</button>
            <div className="pager-info">{filtered.length === 0 ? "0/0" : `${currentIndex + 1}/${filtered.length}`}</div>
            <button className="pager-btn" disabled={currentIndex >= filtered.length - 1} onClick={() => setCurrentIndex(i => Math.min(filtered.length - 1, i + 1))} type="button">ถัดไป →</button>
          </div>


        </section>
      </main>
    </div>
  );
}
