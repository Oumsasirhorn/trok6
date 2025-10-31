// src/pages/Foods.jsx
import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import "./Foods.css";

/* ========== Config & Utils ========== */
const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000";
const FOODS_API = `${API_BASE}/main_dishes`;
const cartKey = (table) => `fd_cart_${table || "unknown"}`;

function norm(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export default function Foods() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();

  // ✅ โต๊ะอ่านจาก query เท่านั้น (ถ้ายังไม่สแกนให้ว่างได้)
  const tableLabel = sp.get("table")?.trim() || "";

  // ====== โหลดรายการอาหาร ======
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [items, setItems] = useState([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setError(null);
        setLoading(true);

        const res = await fetch(`${FOODS_API}?limit=200`, { headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const payload = Array.isArray(data) ? data : data.items || [];

        const base = payload.map((d) => {
          const idRaw = d.id ?? d.item_id ?? d.main_id ?? d.menu_id;
          const id = (idRaw !== null && idRaw !== undefined && idRaw !== "")
            ? String(idRaw)
            : `name:${d.name}`;

          const basePrice =
            norm(d.price) ??
            norm(d.default_price) ??
            norm(d.food_price) ??
            0;
          const price = Number(basePrice) + Number(norm(d.extra_price) ?? 0);

          const img = d.image ? `data:image/png;base64,${d.image}` : "/images/foods/placeholder.jpg";

          return {
            id,
            name: d.name,
            price,
            img,
            qty: 0,
            itemNote: "",
          };
        });

        // ✅ merge cart ต่อโต๊ะ
        const saved = sessionStorage.getItem(cartKey(tableLabel));
        if (saved) {
          const parsed = JSON.parse(saved || "[]");
          const byId = Object.fromEntries((Array.isArray(parsed) ? parsed : []).map((x) => [String(x.id), x]));
          for (const it of base) {
            const prev = byId[it.id];
            if (!prev) continue;
            it.qty = Math.max(0, prev.qty ?? 0);
            if (typeof prev.itemNote === "string") it.itemNote = prev.itemNote;
          }
        }

        if (alive) setItems(base);
      } catch (e) {
        if (alive) setError(e.message || "โหลดข้อมูลล้มเหลว");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [tableLabel]);

  // ====== Persist cart ======
  useEffect(() => {
    try {
      sessionStorage.setItem(cartKey(tableLabel), JSON.stringify(items));
    } catch {}
  }, [items, tableLabel]);

  // ====== บวก/ลบจำนวน ======
  const dec = (id) =>
    setItems((list) => list.map((it) => (it.id === id ? { ...it, qty: Math.max(0, it.qty - 1) } : it)));
  const inc = (id) =>
    setItems((list) => list.map((it) => (it.id === id ? { ...it, qty: it.qty + 1 } : it)));

  const cartCount = useMemo(() => items.reduce((sum, it) => sum + (it.qty || 0), 0), [items]);
  const cartTotal = useMemo(
    () => items.reduce((sum, it) => sum + (Number(it.price || 0) * (it.qty || 0)), 0),
    [items]
  );

  // ====== ไปหน้า Confirm (ไม่บังคับมีโต๊ะ) ======
  const goConfirm = () => {
    const selected = items.filter((it) => (it.qty || 0) > 0);
    if (!selected.length) {
      alert("ยังไม่ได้เลือกรายการอาหาร");
      return;
    }

    const keySel = `${cartKey(tableLabel)}_selected`;
    try {
      sessionStorage.setItem(
        keySel,
        JSON.stringify(
          selected.map((x) => ({
            ...x,
            food_id: String(x.id),
            price: Number(x.price),
          }))
        )
      );
      sessionStorage.setItem(cartKey(tableLabel), JSON.stringify(items));
    } catch {}

    navigate(`/foods/confirm?table=${encodeURIComponent(tableLabel)}`, {
      state: {
        items: selected.map((x) => ({
          ...x,
          food_id: String(x.id),
          price: Number(x.price),
        })),
      },
    });
  };

  // ====== UI ======
  return (
    <div className="fd-page">
      {/* Topbar */}
      <header className="fd-topbar" role="banner">
        <button className="fd-back" onClick={() => navigate("/")} aria-label="ย้อนกลับ">‹</button>
        <div className="fd-title">
          <span>หมายเลขโต๊ะ</span>
          <strong>{tableLabel || "—"}</strong>
        </div>
        <button className="fd-cartBtn" onClick={goConfirm} aria-label="ไปยืนยันออเดอร์">
          <span className="fd-cartIcon" aria-hidden>🧺</span>
          <span className="fd-badge" aria-live="polite">{cartCount}</span>
        </button>
      </header>

      {/* Content */}
      <main className="fd-container" role="main">
        <h2 className="fd-sectionTitle">เมนูอาหาร</h2>

        {error && (
          <div className="fd-error" role="alert">❌ โหลดข้อมูลล้มเหลว: {error}</div>
        )}

        {loading ? (
          <ul className="fd-grid">
            {Array.from({ length: 8 }).map((_, i) => (
              <li key={`sk-${i}`} className="fd-card fd-skeleton">
                <div className="fd-thumb sk" />
                <div className="fd-info">
                  <div className="sk sk-line sk-1" />
                  <div className="sk sk-line sk-2" />
                </div>
                <div className="fd-ctrl">
                  <div className="sk sk-pill" />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="fd-grid">
            {items.map((it) => (
              <li key={`fd-${it.id}`} className="fd-card">
                <div className="fd-thumbWrap">
                  <img
                    className="fd-thumb"
                    src={it.img}
                    alt={it.name}
                    loading="lazy"
                    onError={(e) => {
                      if (e.currentTarget.src !== "/images/foods/placeholder.jpg") {
                        e.currentTarget.src = "/images/foods/placeholder.jpg";
                      }
                    }}
                  />
                </div>

                <div className="fd-info">
                  <h3 className="fd-name" title={it.name}>{it.name}</h3>
                  <div className="fd-price">{Number(it.price || 0).toFixed(2)} ฿</div>
                </div>

                <div className="fd-ctrl" aria-label={`ตัวควบคุมจำนวน ${it.name}`}>
                  <button className="fd-circle" onClick={() => dec(it.id)} aria-label={`ลด ${it.name}`}>–</button>
                  <span className="fd-qty" aria-live="polite">{it.qty}</span>
                  <button className="fd-circle" onClick={() => inc(it.id)} aria-label={`เพิ่ม ${it.name}`}>+</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>

      {/* Bottom confirm bar */}
      <div className={`fd-bottom ${cartCount ? "show" : ""}`} role="region" aria-live="polite">
        <div className="fd-bottomInfo">
          <span className="fd-bottomCount">{cartCount} รายการ</span>
          <span className="fd-bottomTotal">{cartTotal.toFixed(2)} ฿</span>
        </div>
        <button className="fd-bottomBtn" onClick={goConfirm}>
          ยืนยันออเดอร์
        </button>
      </div>
    </div>
  );
}
