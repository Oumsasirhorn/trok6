// src/pages/payment.jsx
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useState, useMemo, useEffect } from "react";
import "./drinks.css";

const RAW = import.meta.env.VITE_API_BASE || "http://localhost:5000";
const API = RAW.replace(/[,\s]+$/,'').replace(/\/+$/,'');


// key สำหรับ sessionStorage
const cartKey = (table) => `dr_cart_${table || "unknown"}`;
const checkoutKey = (table) => `checkout_payload_${table || "unknown"}`;

// ตัวช่วย
const THB = (n) => `${Number(n || 0).toFixed(2)} ฿`;
const s = (v) => (v == null ? "" : String(v));

export default function PaymentCheckout() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const tableLabel = sp.get("table") || "";

  // อ่าน payload ที่หน้าก่อนส่งมา
  const { state } = useLocation();
  const incoming = state?.payload;

  // โหลด/รวม payload: ใช้ state ถ้ามี, ถ้าไม่มีก็ลองดึงจาก sessionStorage
  const [payload, setPayload] = useState(() => {
    if (incoming) return incoming;
    try {
      const raw = sessionStorage.getItem(checkoutKey(tableLabel));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  // ถ้ามี payload ใหม่จาก state → sync ลง sessionStorage ไว้กู้คืน
  useEffect(() => {
    if (!tableLabel) return;
    if (!payload && !incoming) return;
    try {
      sessionStorage.setItem(
        checkoutKey(tableLabel),
        JSON.stringify(incoming || payload)
      );
    } catch {}
  }, [payload, incoming, tableLabel]);

  // ถ้า payload หาย/ว่าง → เด้งกลับไปหน้าเลือก
  useEffect(() => {
    if (!payload) {
      navigate(`/drinks?table=${encodeURIComponent(tableLabel)}`, {
        replace: true,
      });
    }
  }, [payload, navigate, tableLabel]);

  // สกัด option ต่างๆ จาก payload
  const options = payload?.options || {};
  const TEMPS = options.temps?.length ? options.temps : ["ร้อน", "เย็น"];
  const SWEET_LEVELS = options.sweetLevels?.length
    ? options.sweetLevels
    : ["หวานน้อย", "หวานปกติ", "หวานมาก"];

  // ทำ working items: ใส่ default temp/sweet/toppings ถ้าขาด
  const [items, setItems] = useState(() => {
    if (!payload?.items) return [];
    return payload.items.map((x, idx) => ({
      _key: `${x.item_type || "item"}_${x.item_id}_${idx}`,
      ...x,
      qty: Number(x.qty ?? x.quantity ?? 0),
      temp: x.temp ?? null,
      sweet: x.sweet ?? "หวานปกติ",
      note: typeof x.note === "string" ? x.note : "",
      toppings: Array.isArray(x.toppings) ? x.toppings : [],
    }));
  });

  // merge payload รอบหลังๆ
  useEffect(() => {
    if (!payload?.items?.length) return;
    setItems((prev) => {
      if (prev?.length) return prev;
      return payload.items.map((x, idx) => ({
        _key: `${x.item_type || "item"}_${x.item_id}_${idx}`,
        ...x,
        qty: Number(x.qty ?? x.quantity ?? 0),
        temp: x.temp ?? null,
        sweet: x.sweet ?? "หวานปกติ",
        note: typeof x.note === "string" ? x.note : "",
        toppings: Array.isArray(x.toppings) ? x.toppings : [],
      }));
    });
  }, [payload]);

  // โน้ตทั้งบิล (เก็บไว้ใช้ต่อ แม้ backend รุ่นนี้จะไม่บันทึก)
  const [orderNote, setOrderNote] = useState(() => payload?.order_note || "");
  useEffect(() => {
    try {
      sessionStorage.setItem(cartKey(tableLabel), JSON.stringify(items));
      sessionStorage.setItem(cartKey(`${tableLabel}_order_note`), orderNote);
    } catch {}
  }, [items, orderNote, tableLabel]);

  // แผนที่ราคา
  const priceMatrix = payload?.priceMatrix || {};

  // หา unit price ตาม temp
  const unitPriceOf = (it) => {
    const key = String(it.item_id ?? it.id ?? it._key);
    const entry = priceMatrix[key] || {};
    const t =
      it.temp === "ร้อน"
        ? "hot"
        : it.temp === "เย็น"
        ? "cold"
        : it.temp === "ปั่น"
        ? "blend"
        : null;
    if (t && typeof entry[t] === "number") return Number(entry[t]) || 0;
    if (typeof entry.base === "number") return Number(entry.base) || 0;
    if (typeof it.price === "number") return Number(it.price) || 0;
    return 0;
  };

  // คัดเฉพาะ qty>0
  const selected = useMemo(
    () => items.filter((it) => Number(it.qty) > 0),
    [items]
  );

  // คำนวณยอดรวม (ไว้โชว์ UI เฉยๆ)
  const calculated = useMemo(() => {
    let sum = 0;
    const lines = selected.map((it) => {
      const unit = unitPriceOf(it);
      const total = unit * Number(it.qty || 0);
      sum += total;
      return { ...it, unit_price: unit, line_total: total };
    });
    return { sum, lines };
  }, [selected]);

  // วิธีจ่าย -> แปลงเป็น status เพื่อเก็บใน orders เท่านั้น
  const [paymentMethod, setPaymentMethod] = useState(
    payload?.default_payment_method || "เงินสด"
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ให้กดได้เมื่อมีรายการอย่างน้อย 1 และไม่กำลังส่ง
  const canSubmit = selected.length > 0 && !isSubmitting;

  // ✅ ส่งแบบที่ backend มี: POST /orders  { table | table_id, status }
  const submitPayment = async () => {
    try {
      if (!selected.length) {
        alert("ยังไม่มีรายการในตะกร้า");
        return;
      }
      setIsSubmitting(true);

      const body = {
        // ถ้าโปรเจกต์มี table_id ใน payload ก็ส่ง table_id แทนได้
        // table_id: Number(payload?.table_id) || undefined,
        table: tableLabel || undefined, // backend จะ map label -> table_id
        status: paymentMethod === "เงินสด" ? "ชำระเงินแล้ว" : "รอดำเนินการ",
      };

      const res = await fetch(`${API}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error(`สร้างออเดอร์ล้มเหลว: ${res.status} ${t}`);
      }

      // ล้างตะกร้า
      sessionStorage.removeItem(cartKey(tableLabel));
      sessionStorage.removeItem(cartKey(`${tableLabel}_order_note`));
      sessionStorage.removeItem(checkoutKey(tableLabel));

      // ไปหน้า success (ยังโชว์ยอดรวมให้ผู้ใช้เห็นได้)
      navigate(`/drinks/payment/success?table=${encodeURIComponent(tableLabel)}`, {
        state: { method: paymentMethod, amount: calculated.sum },
        replace: true,
      });
    } catch (e) {
      alert(e.message || "เกิดข้อผิดพลาดระหว่างสร้างออเดอร์");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---- UI ----
  if (!payload) return null;

  return (
    <div className="dr-page dr-page--confirm">
      <header className="dr-topbar">
        <button
          className="dr-back"
          onClick={() =>
            navigate(`/drinks?table=${encodeURIComponent(tableLabel)}`)
          }
        >
          ‹
        </button>
        <div className="dr-title">หมายเลขโต๊ะ: {tableLabel || "-"}</div>
      </header>

      <main className="dr-container dr-container--pb">
        {selected.length === 0 ? (
          <div className="dr-empty">
            <p>ยังไม่มีรายการในตะกร้า</p>
            <button
              className="dr-ghostBtn"
              onClick={() =>
                navigate(`/drinks?table=${encodeURIComponent(tableLabel)}`)
              }
            >
              เลือกสินค้า
            </button>
          </div>
        ) : (
          <>
            <ul className="dr-cardList">
              {selected.map((it, idx) => {
                const unit = unitPriceOf(it);
                const line = unit * Number(it.qty);
                return (
                  <li key={it._key} className="dr-card">
                    <div className="dr-card__left">
                      {it.img ? (
                        <img src={it.img} alt={it.name} className="dr-card__thumb" />
                      ) : (
                        <div
                          style={{
                            width: 64,
                            height: 64,
                            borderRadius: 8,
                            background: "#f3f4f6",
                          }}
                        />
                      )}
                    </div>
                    <div className="dr-card__body">
                      <div className="dr-card__head">
                        <div className="dr-card__title">
                          ({idx + 1}) {it.name}
                        </div>
                        <div className="dr-card__unitPrice">{THB(unit)}</div>
                      </div>
                      <div className="dr-card__meta">
                        <span className="dr-qtyPill">× {it.qty}</span>
                        <span className="dr-lineTotal">{THB(line)}</span>
                      </div>

                      {/* ตัวเลือก temp เฉพาะเมนูที่มี temp ใน priceMatrix */}
                      {(() => {
                        const key = String(it.item_id ?? it.id ?? it._key);
                        const entry = priceMatrix[key] || {};
                        const hasTemp =
                          entry.hot != null ||
                          entry.cold != null ||
                          entry.blend != null;
                        if (!hasTemp) return null;
                        return (
                          <div className="dr-optionGroup">
                            {TEMPS.map((t) => (
                              <label key={t} className="dr-radio">
                                <input
                                  type="radio"
                                  name={`temp_${it._key}`}
                                  checked={it.temp === t}
                                  onChange={() =>
                                    setItems((l) =>
                                      l.map((x) =>
                                        x._key === it._key ? { ...x, temp: t } : x
                                      )
                                    )
                                  }
                                />
                                <span>{t}</span>
                              </label>
                            ))}
                          </div>
                        );
                      })()}

                      {/* sweetness เฉพาะ drink (ไม่ได้ส่งไป backend รุ่นนี้) */}
                      {it.item_type === "drink" && (
                        <div className="dr-optionGroup">
                          {SWEET_LEVELS.map((sw) => (
                            <label key={sw} className="dr-radio">
                              <input
                                type="radio"
                                name={`sweet_${it._key}`}
                                checked={it.sweet === sw}
                                onChange={() =>
                                  setItems((l) =>
                                    l.map((x) =>
                                      x._key === it._key ? { ...x, sweet: sw } : x
                                    )
                                  )
                                }
                              />
                              <span>{sw}</span>
                            </label>
                          ))}
                        </div>
                      )}

                      {/* โน้ตรายการ (ไม่ส่งไป backend รุ่นนี้) */}
                      <div style={{ marginTop: 8 }}>
                        <input
                          type="text"
                          placeholder="โน้ตรายการ (เช่น ไม่ใส่หลอด)"
                          value={it.note}
                          onChange={(e) =>
                            setItems((l) =>
                              l.map((x) =>
                                x._key === it._key
                                  ? { ...x, note: e.target.value }
                                  : x
                              )
                            )
                          }
                          style={{
                            width: "100%",
                            padding: "8px 10px",
                            borderRadius: 8,
                            border: "1px solid #e5e7eb",
                          }}
                        />
                      </div>
                    </div>

                    <div className="dr-card__right">
                      <button
                        className="dr-chipDanger"
                        onClick={() =>
                          setItems((l) => l.filter((x) => x._key !== it._key))
                        }
                      >
                        ลบ
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* โน้ตทั้งบิล */}
            <div className="dr-noteWrap">
              <label className="dr-noteLabel">รายละเอียดเพิ่มเติม</label>
              <textarea
                className="dr-noteArea"
                placeholder="เช่น ไม่ใส่หลอด, เสิร์ฟทีเดียว"
                value={orderNote}
                onChange={(e) => setOrderNote(e.target.value)}
              />
            </div>

            {/* วิธีชำระเงิน (ใช้กำหนด status เท่านั้น) */}
            <div
              style={{
                marginTop: 20,
                background: "#fff",
                borderRadius: 12,
                padding: "16px 20px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
              }}
            >
              <label
                style={{
                  fontWeight: 600,
                  fontSize: 15,
                  color: "#333",
                  display: "block",
                  marginBottom: 8,
                }}
              >
                💳 วิธีชำระเงิน
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid #ccc",
                  fontSize: 15,
                  background: "#f9f9f9",
                }}
              >
                <option value="เงินสด">💵 เงินสด</option>
                <option value="บัตรเครดิต">💳 บัตรเครดิต</option>
              </select>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginTop: 16,
                marginBottom: 80,
              }}
            >
              <button className="dr-chipDangerOutline" onClick={() => setItems([])}>
                🗑️ ลบทั้งหมด
              </button>
            </div>
          </>
        )}
      </main>

      {/* แถบสรุปล่าง */}
      {selected.length > 0 && (
        <div
          className="dr-summaryBar"
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            width: "100%",
            background: "#fff",
            boxShadow: "0 -2px 10px rgba(0,0,0,0.1)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "14px 20px",
            borderTop: "1px solid #eee",
            zIndex: 999,
          }}
        >
          <div className="dr-summaryInfo" style={{ fontSize: 15, lineHeight: 1.4 }}>
            <div>
              รวม {selected.length} รายการ{" "}
              <strong style={{ color: "#4CAF50", fontSize: 17 }}>
                {THB(calculated.sum)}
              </strong>
            </div>
            <div style={{ color: "#666" }}>โต๊ะ: {tableLabel}</div>
          </div>
          <button
            className="dr-confirmBtn"
            onClick={submitPayment}
            disabled={!canSubmit}
            style={{
              background: canSubmit ? "#4CAF50" : "#9CCC65",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "12px 28px",
              fontSize: 16,
              fontWeight: 600,
              cursor: canSubmit ? "pointer" : "not-allowed",
            }}
          >
            {isSubmitting ? "⏳ กำลังบันทึก..." : `✅ ยืนยันสั่งออเดอร์ ${THB(calculated.sum)}`}
          </button>
        </div>
      )}
    </div>
  );
}
