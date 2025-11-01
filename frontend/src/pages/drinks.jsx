// src/pages/Drinks.jsx
import { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import "./drinks.css";

/* ========== Config & Utils ========== */
const TEMP_KEYS = ["ร้อน", "เย็น", "ปั่น"];
const API = import.meta.env?.VITE_API_BASE || "http://localhost:5000";
const cartKey = (table) => `dr_cart_${table || "unknown"}`;
const selectedKey = (table) => `${cartKey(table)}_selected`;

function norm(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function buildBasePrices(d) {
  const hot    = norm(d.price_hot    ?? d.hot_price    ?? d.hot);
  const iced   = norm(d.price_iced   ?? d.ice_price    ?? d.cold_price ?? d.ice);
  const frappe = norm(d.price_frappe ?? d.price_blend  ?? d.blend_price ?? d.spin);
  return { "ร้อน": hot, "เย็น": iced, "ปั่น": frappe };
}
function pickDefaultTemp(base_prices = {}) {
  const has = (k) => base_prices[k] !== null && base_prices[k] !== undefined;
  if (has("เย็น")) return "เย็น";
  if (has("ร้อน")) return "ร้อน";
  if (has("ปั่น")) return "ปั่น";
  return null;
}

export default function Drinks() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();

  // ✅ ไม่บังคับต้องมีโต๊ะ: เริ่มต้นว่างไว้ก่อน
  // ถ้ามี ?table= จากการสแกน ค่อยบันทึกลง localStorage และใช้งาน
  const qTable = sp.get("table")?.trim() || "";
  const tableLabel = qTable || localStorage.getItem("active_table") || "";

  useEffect(() => {
    if (qTable) localStorage.setItem("active_table", qTable);
  }, [qTable]);

  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [items, setItems]     = useState([]);

  // เก็บค่าโต๊ะก่อนหน้าไว้ตรวจการสแกนใหม่ เพื่อ "ย้าย" ตะกร้าจาก unknown → โต๊ะ
  const prevTableRef = useRef(tableLabel);

  /* ----- Load from API + merge sessionStorage ----- */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setError(null);
        setLoading(true);

        const res = await fetch(`${API}/drinks`, { headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const payload = Array.isArray(data) ? data : data.items || [];

        const base = payload.map((d) => {
          const base_prices = buildBasePrices(d);
          const tempDefault = d.default_temperature || pickDefaultTemp(base_prices);
          const imgSrc = d.image ? `data:image/png;base64,${d.image}` : "/images/drinks/placeholder.jpg";

          // id เป็น string เสมอ + fallback
          const idRaw = d.id ?? d.drink_id ?? d.item_id ?? d.m_id ?? d.menu_id;
          const id = (idRaw !== null && idRaw !== undefined && idRaw !== "")
            ? String(idRaw)
            : `name:${d.name}`;

          return {
            id,
            name: d.name,
            base_prices,
            extra_price: norm(d.extra_price) ?? 0,
            temp: tempDefault,
            img: imgSrc,
            qty: 0,
          };
        });

        // merge cart ต่อโต๊ะ (ถ้ายังไม่มีโต๊ะ -> ใช้คีย์ unknown)
        const savedRaw = sessionStorage.getItem(cartKey(tableLabel));
        if (savedRaw) {
          let parsed = [];
          try { parsed = JSON.parse(savedRaw) || []; } catch {}
          const byId = Object.fromEntries((Array.isArray(parsed) ? parsed : []).map((x) => [String(x.id), x]));
          for (const it of base) {
            const keep = byId[it.id];
            if (!keep) continue;
            it.qty = Math.max(0, keep.qty ?? 0);
            if (keep.temp && it.base_prices?.[keep.temp] != null) it.temp = keep.temp;
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

  /* ----- ย้ายตะกร้า unknown → โต๊ะ เมื่อเพิ่งสแกนสำเร็จ ----- */
  useEffect(() => {
    const prev = prevTableRef.current;
    if (!prev && tableLabel) {
      try {
        const fromKey = cartKey(""); // dr_cart_unknown
        const fromSel = `${fromKey}_selected`;
        const raw = sessionStorage.getItem(fromKey);
        if (raw) {
          const toKey = cartKey(tableLabel);
          const existRaw = sessionStorage.getItem(toKey);

          if (!existRaw) {
            sessionStorage.setItem(toKey, raw);
          } else {
            const a = JSON.parse(raw || "[]");
            const b = JSON.parse(existRaw || "[]");
            const byId = new Map(b.map((x) => [String(x.id), { ...x }]));
            for (const x of a) {
              const k = String(x.id);
              if (byId.has(k)) {
                byId.set(k, { ...byId.get(k), qty: Math.max(0, (byId.get(k).qty || 0) + (x.qty || 0)) });
              } else {
                byId.set(k, { ...x });
              }
            }
            sessionStorage.setItem(toKey, JSON.stringify(Array.from(byId.values())));
          }
          sessionStorage.removeItem(fromKey);
          sessionStorage.removeItem(fromSel);
        }
      } catch {}
    }
    prevTableRef.current = tableLabel;
  }, [tableLabel]);

  /* ----- Persist cart ----- */
  useEffect(() => {
    try {
      sessionStorage.setItem(cartKey(tableLabel), JSON.stringify(items));
    } catch {}
  }, [items, tableLabel]);

  /* ----- Price calc ----- */
  const unitPrice = (it) => {
    const base = it.base_prices?.[it.temp] != null ? Number(it.base_prices[it.temp]) : 0;
    return base + Number(it.extra_price ?? 0);
  };

  /* ----- Actions ----- */
  const dec = (id) =>
    setItems((list) => list.map((it) => (it.id === id ? { ...it, qty: Math.max(0, it.qty - 1) } : it)));
  const inc = (id) =>
    setItems((list) => list.map((it) => (it.id === id ? { ...it, qty: it.qty + 1 } : it)));
  const setTemp = (id, temp) =>
    setItems((list) =>
      list.map((it) => (it.id !== id ? it : (it.base_prices?.[temp] != null ? { ...it, temp } : it)))
    );

  /* ----- Summary + navigate ----- */
  const cartCount = useMemo(() => items.reduce((s, it) => s + (it.qty || 0), 0), [items]);
  const cartTotal = useMemo(
    () => items.reduce((sum, it) => sum + unitPrice(it) * (it.qty || 0), 0),
    [items]
  );

  const goCart = () => {
    const selected = items.filter((it) => (it.qty || 0) > 0);
    if (!selected.length) {
      alert("ยังไม่ได้เลือกเครื่องดื่ม");
      return;
    }
    try {
      sessionStorage.setItem(
        selectedKey(tableLabel),
        JSON.stringify(selected.map((x) => ({ ...x, drink_id: String(x.id), price: unitPrice(x) })))
      );
      sessionStorage.setItem(cartKey(tableLabel), JSON.stringify(items));
    } catch {}

    // ถ้ายังไม่รู้โต๊ะ → ไปยืนยันได้ แต่จะไม่มี ?table= (ให้ ConfirmDrinks ตรวจต่อ)
    const qs = tableLabel ? `?table=${encodeURIComponent(tableLabel)}` : "";
    navigate(`/drinks/confirm${qs}`, {
      state: {
        // ส่งโต๊ะไปเฉพาะตอนมี
        ...(tableLabel ? { table: tableLabel } : {}),
        items: selected.map((x) => ({
          ...x,
          drink_id: String(x.id),
          price: unitPrice(x),
        })),
      },
    });
  };

  /* ----- UI (mapped to Foods.css classes) ----- */
  return (
    <div className="fd-page">
      {/* Topbar */}
      <header className="fd-topbar" role="banner">
        <button type="button" className="fd-back" onClick={() => navigate("/")} aria-label="ย้อนกลับ">‹</button>
        <div className="fd-title">
          <span>หมายเลขโต๊ะ</span>
          {/* ยังไม่สแกน → แสดงขีด "—" ไว้ก่อน */}
          <strong>{tableLabel || "—"}</strong>
        </div>
        <button type="button" className="fd-cartBtn" onClick={goCart} aria-label="ไปตะกร้า">
          <span className="fd-cartIcon" aria-hidden>🧺</span>
          <span className="fd-badge" aria-live="polite">{cartCount}</span>
        </button>
      </header>

      {/* Content */}
      <main className="fd-container" role="main">
        <h2 className="fd-sectionTitle">เมนูเครื่องดื่ม</h2>

        {error && <div className="fd-error" role="alert">❌ โหลดข้อมูลล้มเหลว: {error}</div>}

        {loading ? (
          <ul className="fd-grid">
            {Array.from({ length: 8 }).map((_, i) => (
              <li key={`sk-${i}`} className="fd-card fd-skeleton">
                <div className="fd-thumbWrap sk" />
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
            {items.map((it) => {
              const price = unitPrice(it);
              return (
                <li key={`dr-${it.id}`} className="fd-card">
                  <div className="fd-thumbWrap">
                    <img
                      className="fd-thumb"
                      src={it.img}
                      alt={it.name}
                      loading="lazy"
                      onError={(e) => {
                        if (e.currentTarget.src !== "/images/drinks/placeholder.jpg") {
                          e.currentTarget.src = "/images/drinks/placeholder.jpg";
                        }
                      }}
                    />
                  </div>

                  <div className="fd-info">
                    <h3 className="fd-name" title={it.name}>{it.name}</h3>
                    <div className="fd-price">{price.toFixed(2)} ฿</div>

                    {/* อุณหภูมิ */}
                    <div
                      style={{
                        display: "flex",
                        gap: ".5rem",
                        marginTop: ".55rem",
                        flexWrap: "wrap",
                      }}
                    >
                      {TEMP_KEYS.map((t) => {
                        const hasPrice = it.base_prices?.[t] != null; // 0 ได้
                        const active = it.temp === t;
                        return (
                          <button
                            key={t}
                            type="button"
                            onClick={() => hasPrice && setTemp(it.id, t)}
                            disabled={!hasPrice}
                            aria-pressed={active}
                            aria-label={`${it.name} – ${t}`}
                            title={
                              hasPrice
                                ? `${t} (${Number(it.base_prices[t]).toFixed(0)} ฿)`
                                : `ไม่มีราคา ${t}`
                            }
                            style={{
                              padding: ".35rem .6rem",
                              borderRadius: "999px",
                              border: "1px solid var(--border)",
                              background: active ? "var(--brand)" : "var(--chip)",
                              color: active ? "#fff" : "var(--ink)",
                              cursor: hasPrice ? "pointer" : "not-allowed",
                              opacity: hasPrice ? 1 : 0.5,
                              fontWeight: 700,
                              boxShadow: "var(--shadow)",
                              fontSize: ".85rem",
                            }}
                          >
                            {t}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="fd-ctrl" aria-label={`ตัวควบคุมจำนวน ${it.name}`}>
                    <button type="button" className="fd-circle" onClick={() => dec(it.id)} aria-label={`ลด ${it.name}`}>–</button>
                    <span className="fd-qty" aria-live="polite">{it.qty}</span>
                    <button type="button" className="fd-circle" onClick={() => inc(it.id)} aria-label={`เพิ่ม ${it.name}`}>+</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      {/* Bottom confirm bar */}
      <div className={`fd-bottom ${cartCount ? "show" : ""}`} role="region" aria-live="polite">
        <div className="fd-bottomInfo">
          <span className="fd-bottomCount">{cartCount} รายการ</span>
          <span className="fd-bottomTotal">{cartTotal.toFixed(2)} ฿</span>
        </div>
        <button className="fd-bottomBtn" onClick={goCart}>ยืนยันออเดอร์</button>
      </div>
    </div>
  );
}
