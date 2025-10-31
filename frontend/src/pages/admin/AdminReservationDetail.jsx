// src/pages/admin/AdminReservations.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import "./admin.css";

const RAW = import.meta.env.VITE_API_BASE || "http://localhost:5000";
const API = RAW.replace(/[,\s]+$/,'').replace(/\/+$/,'');


function NavItem({ icon: Icon, label, active, onClick }) {
  return (
    <button type="button" className={`ad-nav__item ${active ? "is-active" : ""}`} onClick={onClick}>
      <Icon /><span>{label}</span>
    </button>
  );
}
function isDashboard() { return (<svg viewBox="0 0 24 24"><path d="M3 6h18M3 12h18M3 18h18" /></svg>); }
function MenuIcon() { return (<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h10M4 18h16" /></svg>); }
function UsersIcon() { return (<svg viewBox="0 0 24 24"><path d="M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" /><path d="M3 21c0-4 4-6 8-6" /></svg>); }
function TablesIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="12" y1="3" x2="12" y2="21" />
    </svg>
  );
}
function LogoutIcon() { return (<svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>); }

// map API -> UI
function mapBooking(r) {
  return {
    id: r.id ?? r.booking_id ?? r._id,
    customer_name: r.customer_name ?? r.name ?? "",
    phone: r.phone ?? r.tel ?? "",
    table_id: String(r.table_id ?? r.table ?? ""),
    table_number: r.table_number ?? r.table ?? "",
    date: r.date || "",
    time: r.time || "",
    guests: Number.isFinite(Number(r.guests)) ? Number(r.guests) : 1,
    status: r.status ?? "pending",
    note: r.note ?? "",
    qr_code: r.qr_code || null,
    _raw: r,
  };
}

export default function AdminReservations() {
  const { admin, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState({ customer_name: "", phone: "", table_id: "", date: "", time: "", guests: 1, status: "pending", note: "" });
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ customer_name: "", phone: "", table_id: "", date: "", time: "", guests: 1, status: "pending", note: "" });
  const [toast, setToast] = useState(null);

  const showToast = (text, type = "ok") => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 1800);
  };

  const q = searchParams.get("q") || "";

  const isDashboard = location.pathname === "/admin";
  const isMenu = location.pathname.startsWith("/admin/menu");
  const isResv = location.pathname.startsWith("/admin/reservations");
  const isTable = location.pathname.startsWith("/admin/table")


  // โหลด bookings
  useEffect(() => {
    let ignore = false;
    (async () => {
      setLoading(true); setErr("");
      try {
        const res = await fetch(`${API_BASE}/bookings`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const list = (data || []).map(mapBooking);
        if (!ignore) setRows(list);
      } catch (e) {
        if (!ignore) { setErr(`โหลดข้อมูลล้มเหลว: ${e.message}`); setRows([]); }
      } finally {
        if (!ignore) setLoading(false);
      }
    })();
    return () => { ignore = true; };
  }, []);

  const filtered = useMemo(() => {
    if (!q) return rows;
    const s = q.toLowerCase();
    return rows.filter(r =>
      (r.customer_name || "").toLowerCase().includes(s) ||
      (r.phone || "").toLowerCase().includes(s) ||
      (r.table_id || "").toLowerCase().includes(s) ||
      (r.status || "").toLowerCase().includes(s) ||
      (r.date || "").toLowerCase().includes(s) ||
      (r.time || "").toLowerCase().includes(s)
    );
  }, [rows, q]);

  const onSearch = (e) => setSearchParams({ q: e.target.value });

  const onCreateOpen = () => {
    setForm({ customer_name: "", phone: "", table_id: "", date: "", time: "", guests: 1, status: "pending", note: "" });
    setAdding(true);
  };

  const onCreate = async () => {
    if (!form.customer_name || !form.phone || !form.table_id || !form.date || !form.time) {
      return showToast("กรอกข้อมูลให้ครบ (ชื่อ, โทร, โต๊ะ, วันที่, เวลา)", "err");
    }

    const tempId = `tmp_${Date.now()}`;
    const optimistic = { id: tempId, ...form };
    setRows(prev => [...prev, optimistic]);
    setAdding(false);

    try {
      const res = await fetch(`${API_BASE}/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const created = await res.json();
      const newId = created?.id ?? created?.booking_id ?? created?._id ?? null;
      setRows(prev => prev.map(r => (r.id === tempId ? { ...r, id: newId || r.id } : r)));
      showToast("สร้างการจองสำเร็จ");
    } catch (e) {
      setRows(prev => prev.filter(r => r.id !== tempId));
      showToast(`สร้างการจองล้มเหลว: ${e.message}`, "err");
    }
  };

  const onEdit = (r) => {
    setEditId(r.id);
    setDraft({ ...r });
  };
  const onCancel = () => {
    setEditId(null);
    setDraft({ customer_name: "", phone: "", table_id: "", date: "", time: "", guests: 1, status: "pending", note: "" });
  };
  const onSave = async (id) => {
    if (!draft.customer_name || !draft.phone || !draft.table_id || !draft.date || !draft.time) {
      return showToast("กรอกข้อมูลให้ครบ (ชื่อ, โทร, โต๊ะ, วันที่, เวลา)", "err");
    }
    const prev = rows;
    setRows(prev.map(r => (r.id === id ? { ...r, ...draft } : r)));
    setEditId(null);
    try {
      const res = await fetch(`${API_BASE}/bookings/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showToast("บันทึกการแก้ไขแล้ว");
    } catch (e) {
      setRows(prev);
      showToast(`บันทึกล้มเหลว: ${e.message}`, "err");
    }
  };

  const onDelete = async (r) => {
    if (!confirm(`ลบการจองของ “${r.customer_name}” โต๊ะ ${r.table_number}?`)) return;
    const prev = rows;
    setRows(p => p.filter(x => x.id !== r.id));
    try {
      const res = await fetch(`${API_BASE}/bookings/${r.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showToast("ลบการจองแล้ว");
    } catch (e) {
      setRows(prev);
      showToast(`ลบไม่สำเร็จ: ${e.message}`, "err");
    }
  };

  // ✅ onApproveTable: อนุมัติโต๊ะ + สร้าง QR + zone
  // ... โค้ด Booking.jsx เดิมด้านบน

  // ฟังก์ชันอนุมัติโต๊ะ + สร้าง QR
  const onApproveTable = async (booking) => {
    if (!confirm(`ยืนยันอนุมัติการจองโต๊ะ ${booking.table_number}?`)) return;

    try {
      const res = await fetch(`${API_BASE}/tables/${booking.table_number}/generate-qr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zone: booking.zone || "โซนในร้าน" })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();

      setRows(prev => prev.map(r =>
        String(r.table_number) === String(booking.table_number)
          ? { ...r, status: data.status, qr_code: data.qr_code, zone: data.zone }
          : r
      ));

      showToast("สร้าง QR & อนุมัติโต๊ะแล้ว");
    } catch (e) {
      console.error("onApproveTable error:", e);
      showToast(`อนุมัติล้มเหลว: ${e.message}`, "err");
    }
  };



  // ✅ onRejectTable: ปฏิเสธโต๊ะ + เคลียร์ QR
  const onRejectTable = async (booking) => {
    if (!confirm(`ยืนยันปฏิเสธการจองโต๊ะ ${booking.table_number}?`)) return;

    try {
      const res = await fetch(`${API_BASE}/tables/${booking.table_number}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject" })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();

      // อัพเดตตารางใน UI
      setRows(prev => prev.map(r =>
        String(r.table_number) === String(booking.table_number)
          ? { ...r, status: data.status, qr_code: data.qr_code, zone: data.zone }
          : r
      ));


      showToast("ปฏิเสธโต๊ะเรียบร้อยแล้ว");
    } catch (e) {
      console.error("onRejectTable error:", e);
      showToast(`ปฏิเสธล้มเหลว: ${e.message}`, "err");
    }
  };




  return (
    <div className="admin-layout">
      <aside className="ad-sidebar">
        <nav className="ad-nav">
          <NavItem icon={isDashboard} label="Dashboard" active={isDashboard} onClick={() => navigate("/admin")} />
          <NavItem icon={MenuIcon} label="จัดการเมนูอาหาร" active={isMenu} onClick={() => navigate("/admin/menu")} />
          <NavItem icon={UsersIcon} label="จัดการจอง (ฺBookings) " active={isResv} onClick={() => navigate("/admin/reservations")} />
          <NavItem icon={TablesIcon} label="จัดการ Tables" active={isTable} onClick={() => navigate("/admin/tables")} />

          <NavItem icon={LogoutIcon} label="ออกจากระบบ" type="button" onClick={logout} />
        </nav>
      </aside>

      <main className="ad-main">
        <header className="ad-header">
          <div className="ad-profile">
            <div className="ad-avatar">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-5 4-7 8-7s8 2 8 7" /></svg>
            </div>
            <h1 className="ad-title">จัดการการจอง — แอดมิน {admin?.username || "ปลาเผา"}</h1>
          </div>

          <div className="ad-actions">
            <input
              className="input"
              placeholder="ค้นหา ชื่อ/โทร/โต๊ะ/สถานะ/วันที่/เวลา"
              value={q}
              onChange={onSearch}
              style={{ width: 320 }}
            />
            <button type="button" className="btn-primary" onClick={onCreateOpen}>
              + สร้างการจอง
            </button>
          </div>
        </header>

        {loading ? <p>Loading...</p> : err ? <p style={{ color: "red" }}>{err}</p> : (
          <table className="ad-table">
            <thead>
              <tr>
                <th>ชื่อ</th><th>โทร</th><th>โต๊ะ</th><th>วันที่</th><th>เวลา</th><th>จำนวน</th><th>สถานะ/QR</th><th>หมายเหตุ</th><th>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id}>
                  <td>{editId === r.id ? <input value={draft.customer_name} onChange={e => setDraft(d => ({ ...d, customer_name: e.target.value }))} /> : r.customer_name}</td>
                  <td>{editId === r.id ? <input value={draft.phone} onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))} /> : r.phone}</td>
                  <td>{editId === r.id ? <input value={draft.table_id} onChange={e => setDraft(d => ({ ...d, table_id: e.target.value }))} /> : r.table_number}</td>
                  <td>{editId === r.id ? <input type="date" value={draft.date} onChange={e => setDraft(d => ({ ...d, date: e.target.value }))} /> : r.date}</td>
                  <td>{editId === r.id ? <input type="time" value={draft.time} onChange={e => setDraft(d => ({ ...d, time: e.target.value }))} /> : r.time}</td>
                  <td>{editId === r.id ? <input type="number" value={draft.guests} onChange={e => setDraft(d => ({ ...d, guests: Number(e.target.value) }))} /> : r.guests}</td>
                  <td>
                    {r.qr_code
                      ? <img src={r.qr_code} alt="QR Code" style={{ width: 60, height: 60 }} />
                      : <span className="pill">{r.status}</span>}
                  </td>
                  <td>
                    {editId === r.id ? (
                      <input value={draft.note} onChange={e => setDraft(d => ({ ...d, note: e.target.value }))} />
                    ) : (
                      <>
                        <button type="button" className="link" onClick={() => onEdit(r)}>Edit</button> |
                        <button type="button" className="link" onClick={() => onDelete(r)}>Delete</button> |
                        {r.status === "ว่าง" && <button type="button" className="link" onClick={() => onApproveTable(r)}>อนุมัติ & QR</button>}
                        {r.status === "จองแล้ว" && <button type="button" className="link" onClick={() => onRejectTable(r)}>ปฏิเสธ</button>}
                      </>
                    )}
                  </td>


                </tr>
              ))}
            </tbody>
          </table>
        )}

        {adding && (
          <div className="modal">
            <div className="modal-content">
              <h2>สร้างการจองใหม่</h2>
              <input placeholder="ชื่อลูกค้า" value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} />
              <input placeholder="โทร" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              <input placeholder="โต๊ะ" value={form.table_id} onChange={e => setForm(f => ({ ...f, table_id: e.target.value }))} />
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              <input type="time" value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} />
              <input type="number" placeholder="จำนวน" value={form.guests} onChange={e => setForm(f => ({ ...f, guests: Number(e.target.value) }))} />
              <input placeholder="หมายเหตุ" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
              <button type="button" className="btn-primary" onClick={onCreate}>Save</button>
              <button type="button" className="btn-secondary" onClick={() => setAdding(false)}>Cancel</button>
            </div>
          </div>
        )}

        {toast && (
          <div className={`toast ${toast.type === "err" ? "error" : "ok"}`}>{toast.text}</div>
        )}
      </main>
    </div>
  );
}
