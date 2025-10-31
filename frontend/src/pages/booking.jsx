import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import "./booking.css";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000";
const ZONES = ["โซนในร้าน", "โซนนอกร้าน"];
const INSIDE_MAX = 18;

function deriveZoneFromLabel(label = "") {
  const m = String(label).match(/(\d+)/);
  const n = m ? Number(m[1]) : NaN;
  if (Number.isNaN(n)) return "โซนในร้าน";
  return n <= INSIDE_MAX ? "โซนในร้าน" : "โซนนอกร้าน";
}

export default function Booking() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tables, setTables] = useState([]);
  const [selected, setSelected] = useState(null);
  const [zone, setZone] = useState("โซนในร้าน");

  const [highlight, setHighlight] = useState(sp.get("highlight") || "");

  // โหลดโต๊ะจาก DB
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError("");
        const r = await fetch(`${API_BASE}/tables`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();

        const normalized = (Array.isArray(data) ? data : []).map((t) => ({
          id: t.table_id,
          number: t.table_number || `T${t.table_id}`,
          status: t.status || "ว่าง",
          zone: t.zone && t.zone.trim() !== "" ? t.zone.trim() : deriveZoneFromLabel(t.table_number || ""),
        }));

        const ordered = normalized.sort((a, b) => {
          const na = Number(a.number.match(/\d+/)?.[0] ?? 1e9);
          const nb = Number(b.number.match(/\d+/)?.[0] ?? 1e9);
          return na - nb;
        });

        if (alive) setTables(ordered);
      } catch (e) {
        if (alive) setError(e.message || "โหลดข้อมูลโต๊ะไม่สำเร็จ");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false };
  }, []);

  // auto-clear highlight
  useEffect(() => {
    if (!highlight) return;
    const t = setTimeout(() => setHighlight(""), 2500);
    return () => clearTimeout(t);
  }, [highlight]);

  // filter tables ตาม zone (trim ป้องกัน space)
  const visibleTables = useMemo(
    () => tables.filter(t => t.zone?.trim() === zone.trim()),
    [tables, zone]
  );

  const countAll = visibleTables.length;
  const countBusy = visibleTables.filter(t => t.status === "จองแล้ว" || t.status === "กำลังใช้งาน").length;
  const countFree = countAll - countBusy;

  // reset selected ถ้าเปลี่ยน zone
  useEffect(() => {
    if (selected && !visibleTables.some(t => t.number === selected)) setSelected(null);
  }, [zone, visibleTables, selected]);

  const isReserved = (t) => t.status === "จองแล้ว" || t.status === "กำลังใช้งาน";
  const onPick = (t) => { if (isReserved(t)) return; setSelected(p => p === t.number ? null : t.number); };
  const onConfirm = (e) => {
    e.preventDefault();
    if (!selected) return alert("โปรดเลือกโต๊ะก่อน");
    navigate("/confirm", { state: { tableNo: selected, zone } });
  };

  return (
    <div className="booking-page">
      <header className="bk-titlebar">
        <button className="bk-back" onClick={() => navigate(-1)} aria-label="ย้อนกลับ">
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
          </svg>
        </button>
        <h1>จองโต๊ะ</h1>
      </header>

      {/* zone selector */}
      <section className="bk-zones">
        {ZONES.map(z => (
          <button
            key={z}
            className={`bk-zone ${zone === z ? "active" : ""}`}
            onClick={() => setZone(z)}
            type="button"
          >
            <span className="dot" aria-hidden="true" />{z}
          </button>
        ))}
      </section>

      {/* stats */}
      <section className="bk-stats">
        <div className="stat"><div className="stat__label">ทั้งหมด</div><div className="stat__value">{countAll}</div></div>
        <div className="stat"><div className="stat__label">ว่าง</div><div className="stat__value">{countFree}</div></div>
        <div className="stat"><div className="stat__label">จองแล้ว / กำลังใช้งาน</div><div className="stat__value">{countBusy}</div></div>
      </section>

      <div className="bk-legend top"><span className="bar" aria-hidden="true" />เวที</div>

      {/* table map */}
      <section className="bk-map">
        {loading && <div className="bk-loading"><div className="shimmer" />กำลังโหลดโต๊ะ…</div>}
        {error && <div className="bk-error">{error}</div>}

        {!loading && !error && (
          <div className="seat-grid" role="list" aria-label={`ผังโต๊ะ (${zone})`}>
            {visibleTables.map(t => {
              const reserved = isReserved(t);
              const isHL = highlight && t.number === highlight;
              const isSel = selected === t.number;
              return (
                <button
                  key={t.id}
                  className={`seat
                    ${reserved ? t.status === "กำลังใช้งาน" ? "seat--busy" : "seat--reserved" : ""}
                    ${isSel ? "seat--selected" : ""}
                    ${isHL ? "seat--hl" : ""}`}
                  onClick={() => onPick(t)}
                  type="button"
                  disabled={reserved}
                  aria-label={reserved ? `${t.number} ${t.status}` : `โต๊ะ ${t.number}`}
                  title={reserved ? t.status : `เลือกโต๊ะ ${t.number}`}
                  role="listitem"
                >
                  <span className="seat__num">{t.number}</span>
                  <span className="seat__status">{t.status}</span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <div className="bk-legend bottom"><span className="bar" aria-hidden="true" />ประตูร้าน</div>

      {/* confirm */}
      <form onSubmit={onConfirm} className="bk-actions">
        <div className="bk-summary" aria-live="polite">
          โต๊ะที่เลือก: <strong>{selected ?? "-"}</strong>
          <span className="sep">•</span>
          โซน: <strong>{zone}</strong>
        </div>
        <button className="bk-submit" type="submit" disabled={!selected}>ยืนยันการจอง</button>
      </form>
    </div>
  );
}
