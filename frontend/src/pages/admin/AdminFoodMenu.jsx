// src/pages/admin/AdminFoodMenu.jsx
import { useEffect, useMemo, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import "./admin.css";

/* ====== FIX: กัน VITE_API_BASE เขียนพลาดมี , หรือ / ท้าย ====== */
const RAW = import.meta.env.VITE_API_BASE || "http://localhost:5000";
const API = RAW.replace(/[,\s]+$/, "").replace(/\/+$/, "");
// ใช้ `${API}/...` เสมอ


/* ====== Resources ====== */
const RESOURCE_MAP = { main: "main_dishes", snack: "snacks", drink: "drinks" };
const TYPE_LABEL   = { main: "อาหารจานหลัก", snack: "ของว่าง", drink: "เครื่องดื่ม" };

/* ====== Helpers ====== */
function extractId(r) {
  return (
    r.item_id ??
    r.id ??
    r.menu_id ??
    r._id ??
    r.dish_id ??
    r.food_id ??
    r.main_dish_id ??
    null
  );
}

/* ---------- รูป: ครอบจักรวาล ---------- */
const isLikelyBase64 = (s) =>
  /^[A-Za-z0-9+/=\s]+$/.test(s || "") && (s || "").replace(/\s+/g, "").length > 60;

const asDataUrlFromBase64 = (b64, mimeHint = "image/jpeg") =>
  b64 ? `data:${mimeHint};base64,${String(b64).replace(/\s+/g, "")}` : null;

/* ---------- normalize คำค้นหา: ไม่แคร์วรรณยุกต์/ช่องว่างซ้ำ ---------- */
const normalizeText = (s = "") =>
  String(s)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "") // ตัดวรรณยุกต์/diacritics
    .replace(/\s+/g, " ") // ช่องว่างซ้ำ -> ช่องเดียว
    .trim();

/* ---------- รวมทุกเคสภาพจาก backend ---------- */
function imgFromBackend(r) {
  // dataURL เต็ม
  if (typeof r.images_data === "string" && r.images_data.trim().startsWith("data:"))
    return r.images_data.trim();
  if (typeof r.image === "string" && r.image.trim().startsWith("data:"))
    return r.image.trim();

  // base64 ล้วน
  if (typeof r.images_data === "string" && isLikelyBase64(r.images_data)) {
    return asDataUrlFromBase64(r.images_data, r.image_mime || r.mime || "image/jpeg");
  }
  if (typeof r.image === "string" && isLikelyBase64(r.image)) {
    return asDataUrlFromBase64(r.image, r.image_mime || r.mime || "image/jpeg");
  }

  // Buffer object { type: 'Buffer', data: [...] }
  const objs = [r.image, r.images_data].filter((x) => typeof x === "object" && x);
  for (const o of objs) {
    try {
      if (o?.type === "Buffer" && Array.isArray(o.data)) {
        const b64 = btoa(String.fromCharCode(...o.data));
        const mime = r.image_mime || "image/jpeg";
        return asDataUrlFromBase64(b64, String(mime));
      }
    } catch {}
  }

  // เส้นทางไฟล์/URL
  const paths = [r.image_path, r.image_url, r.img_url, r.img_path, r.thumbnail, r.url, r.image]
    .filter((x) => typeof x === "string" && x.trim());
  if (paths.length) {
    const raw = paths[0].trim();
    const ver =
      r.image_ver ?? r.updated_at ?? r.update_at ?? r.modified_at ?? r.image_updated_at ?? "";
    const addVer = (x) => (ver ? `${x}${x.includes("?") ? "&" : "?"}v=${encodeURIComponent(String(ver))}` : x);
    if (raw.startsWith("http")) return addVer(raw);
    if (raw.startsWith("/")) return addVer(`${API_BASE}${raw}`);
    return addVer(`${API_BASE}/${raw.replace(/^\.?\//, "")}`);
  }
  return "https://placehold.co/600x400?text=No+Image";
}

const toNumberSafe = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const fileToDataURL = (file) =>
  new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => rej(new Error("อ่านไฟล์ไม่สำเร็จ"));
    fr.readAsDataURL(file);
  });

/* ===========================================
   Component
=========================================== */
export default function AdminFoodMenu() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();

  const isDashboard = location.pathname === "/admin";
  const isFoodMenu  = location.pathname.startsWith("/admin/menu");
  const isUsers     = location.pathname.startsWith("/admin/users");

  const [type, setType] = useState("main");
  const [menus, setMenus] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [query, setQuery] = useState("");
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState({ name: "", price: "", img: "" });

  // ฟอร์มแก้รูป
  const [editPreview, setEditPreview] = useState("");
  const [editRemove, setEditRemove] = useState(false);
  const [editBusy, setEditBusy] = useState(false);

  // ฟอร์มเพิ่ม
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "",
    price: "",
    img: "",
    price_hot: "",
    price_iced: "",
    price_frappe: "",
  });
  const [addBusy, setAddBusy] = useState(false);
  const [addPreview, setAddPreview] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const [toast, setToast] = useState(null);
  const showToast = (text, type = "ok") => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 1500);
  };

  const resName = RESOURCE_MAP[type];
  const PAGE_SIZE = 200;
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const fmt = (n) => toNumberSafe(n).toFixed(2);

  /* ---------- โหลดรายการ ---------- */
  const loadMenus = useCallback(
    async ({ reset = false } = {}) => {
      const nextOffset = reset ? 0 : offset;
      setLoading(true);
      setErr("");
      try {
        const url = new URL(`${API_BASE}/${resName}`);
        url.searchParams.set("limit", PAGE_SIZE);
        url.searchParams.set("offset", String(nextOffset));
        url.searchParams.set("with_total", "1");
        if (query.trim()) url.searchParams.set("q", query.trim());

        const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const rows = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];

        const mapped = rows
          .map((r) => {
            const id = extractId(r) ?? r.id;
            if (!id) return null;
            const isDrink = resName === "drinks";
            const price_hot = toNumberSafe(r.price_hot ?? r.hot ?? r.priceHot);
            const price_iced = toNumberSafe(r.price_iced ?? r.cold ?? r.priceCold);
            const price_frappe = toNumberSafe(r.price_frappe ?? r.blend ?? r.priceBlend);
            const basePrice = isDrink
              ? Math.min(...[price_hot, price_iced, price_frappe].filter((n) => Number.isFinite(n) && n > 0)) || 0
              : toNumberSafe(r.price ?? r.base_price ?? r.cost);

            return {
              id,
              name: r.name ?? r.title ?? "",
              price: basePrice,
              prices: isDrink ? { hot: price_hot, iced: price_iced, frappe: price_frappe } : null,
              img: imgFromBackend(r),
              _raw: r,
            };
          })
          .filter(Boolean);

        setMenus((prev) => (reset ? mapped : [...prev, ...mapped]));

        const total = Number.isFinite(json?.total) ? Number(json.total) : null;
        const newOffset = nextOffset + mapped.length;
        setOffset(newOffset);
        setHasMore(total == null ? mapped.length === PAGE_SIZE : newOffset < total);
      } catch (e) {
        setErr(`โหลดข้อมูลล้มเหลว: ${e.message}`);
        if (reset) setMenus([]);
        setHasMore(false);
      } finally {
        setLoading(false);
      }
    },
    [resName, query, offset]
  );

  useEffect(() => {
    setMenus([]);
    setOffset(0);
    setHasMore(true);
    loadMenus({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resName, query]);

  /* ---------- Filter client-side ---------- */
  const filteredMenus = useMemo(() => {
    const q = normalizeText(query);
    if (!q) return menus;
    return menus.filter((m) => {
      const name = normalizeText(m?.name || "");
      const idStr = normalizeText(String(m?.id || ""));
      const priceStr = normalizeText(String(m?.price ?? ""));
      const priceHot = normalizeText(String(m?.prices?.hot ?? ""));
      const priceIced = normalizeText(String(m?.prices?.iced ?? ""));
      const priceFrappe = normalizeText(String(m?.prices?.frappe ?? ""));
      return (
        name.includes(q) ||
        idStr.includes(q) ||
        priceStr.includes(q) ||
        priceHot.includes(q) ||
        priceIced.includes(q) ||
        priceFrappe.includes(q)
      );
    });
  }, [menus, query]);

  /* ---------- Edit ---------- */
  const startEdit = (m) => {
    setEditId(m.id);
    setDraft({
      name: m.name,
      price: m.price,
      price_hot: m?.prices?.hot ?? "",
      price_iced: m?.prices?.iced ?? "",
      price_frappe: m?.prices?.frappe ?? "",
      img: "", // จะเซ็ตเป็น dataURL เมื่อเลือกไฟล์
    });
    setEditPreview(m.img || "");
    setEditRemove(false);
  };

  const onEditFile = async (file) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) return showToast("รองรับเฉพาะไฟล์รูปภาพ", "err");
    if (file.size > 100 * 1024 * 1024) return showToast("ขนาดไฟล์เกิน 100MB", "err");
    try {
      const dataUrl = await fileToDataURL(file);
      setDraft((d) => ({ ...d, img: dataUrl }));
      setEditPreview(dataUrl);
      setEditRemove(false);
    } catch {
      showToast("อ่านไฟล์ไม่สำเร็จ", "err");
    }
  };

  const confirmEdit = async (id) => {
    if (!id) return showToast("เมนูนี้ไม่มีรหัส (id)", "err");
    if (!draft.name) return showToast("กรอกข้อมูลให้ครบ", "err");
    if (editBusy) return;

    const nextDisplayedPrice =
      resName === "drinks"
        ? Math.min(
            ...[
              toNumberSafe(draft.price_hot ?? 0),
              toNumberSafe(draft.price_iced ?? 0),
              toNumberSafe(draft.price_frappe ?? 0),
            ].filter((x) => x > 0)
          ) || 0
        : toNumberSafe(draft.price);

    const prev = menus;
    setMenus(
      prev.map((m) =>
        m.id === id
          ? {
              ...m,
              name: draft.name,
              price: nextDisplayedPrice,
              prices:
                resName === "drinks"
                  ? {
                      hot: toNumberSafe(draft.price_hot ?? m?.prices?.hot ?? 0),
                      iced: toNumberSafe(draft.price_iced ?? m?.prices?.iced ?? 0),
                      frappe: toNumberSafe(draft.price_frappe ?? m?.prices?.frappe ?? 0),
                    }
                  : m.prices ?? null,
              img: editPreview || m.img,
            }
          : m
      )
    );
    setEditId(null);
    setEditBusy(true);

    try {
      const payload =
        resName === "drinks"
          ? {
              name: draft.name,
              price_hot: toNumberSafe(draft.price_hot ?? 0),
              price_iced: toNumberSafe(draft.price_iced ?? 0),
              price_frappe: toNumberSafe(draft.price_frappe ?? 0),
              price: nextDisplayedPrice,
              image_ver: Date.now(),
            }
          : { name: draft.name, price: toNumberSafe(draft.price), image_ver: Date.now() };

      // รับรูปจากไฟล์เท่านั้น (dataURL)
      if (draft.img && draft.img.startsWith("data:")) {
        payload.images_data = draft.img;
      }
      if (editRemove && !draft.img) payload.image_delete = true;

      const res = await fetch(`${API_BASE}/${resName}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadMenus({ reset: true });
      showToast("บันทึกเมนูแล้ว");
    } catch (e) {
      setMenus(prev);
      showToast(`บันทึกล้มเหลว: ${e.message}`, "err");
    } finally {
      setEditBusy(false);
    }
  };

  const deleteItem = async (id) => {
    if (!id) return showToast("เมนูนี้ไม่มีรหัส (id)", "err");
    if (!confirm("ลบเมนูนี้?")) return;
    const prev = menus;
    setMenus((p) => p.filter((m) => m.id !== id));
    try {
      const res = await fetch(`${API_BASE}/${resName}/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadMenus({ reset: true });
      showToast("ลบเมนูแล้ว");
    } catch (e) {
      setMenus(prev);
      showToast(`ลบไม่สำเร็จ: ${e.message}`, "err");
    }
  };

  /* ---------- Add ---------- */
  const openAdd = () => {
    setAddForm({
      name: "",
      price: "",
      img: "",
      price_hot: "",
      price_iced: "",
      price_frappe: "",
    });
    setAddPreview("");
    setAdding(true);
  };
  const cancelAdd = () => {
    setAdding(false);
    setAddPreview("");
  };

  const onAddFile = async (file) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) return showToast("รองรับเฉพาะไฟล์รูปภาพ", "err");
    if (file.size > 100 * 1024 * 1024) return showToast("ขนาดไฟล์เกิน 100MB", "err");
    try {
      const dataUrl = await fileToDataURL(file);
      setAddForm((f) => ({ ...f, img: dataUrl }));   // เก็บเป็น dataURL
      setAddPreview(dataUrl);
    } catch {
      showToast("อ่านไฟล์ไม่สำเร็จ", "err");
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onAddFile(file);
  };

  const confirmAdd = async () => {
    if (!addForm.name) return showToast("กรอกชื่อให้ครบ", "err");
    if (resName === "drinks") {
      const anyPrice =
        toNumberSafe(addForm.price_hot) > 0 ||
        toNumberSafe(addForm.price_iced) > 0 ||
        toNumberSafe(addForm.price_frappe) > 0;
      if (!anyPrice) return showToast("กรอกราคาอย่างน้อย 1 ช่อง", "err");
    } else if (addForm.price === "") {
      return showToast("กรอกราคา", "err");
    }
    if (addBusy) return;

    const tempId = `tmp_${Date.now()}`;
    const basePrice =
      resName === "drinks"
        ? Math.min(
            ...[
              toNumberSafe(addForm.price_hot),
              toNumberSafe(addForm.price_iced),
              toNumberSafe(addForm.price_frappe),
            ].filter((x) => x > 0)
          ) || 0
        : toNumberSafe(addForm.price);

    setMenus((prev) => [
      ...prev,
      {
        id: tempId,
        name: addForm.name,
        price: basePrice,
        prices:
          resName === "drinks"
            ? {
                hot: toNumberSafe(addForm.price_hot),
                iced: toNumberSafe(addForm.price_iced),
                frappe: toNumberSafe(addForm.price_frappe),
              }
            : null,
        img: addPreview || "https://placehold.co/600x400?text=No+Image",
      },
    ]);
    setAdding(false);
    setAddBusy(true);

    try {
      const payload =
        resName === "drinks"
          ? {
              name: addForm.name,
              price_hot: toNumberSafe(addForm.price_hot),
              price_iced: toNumberSafe(addForm.price_iced),
              price_frappe: toNumberSafe(addForm.price_frappe),
              price: basePrice,
              image_ver: Date.now(),
            }
          : { name: addForm.name, price: toNumberSafe(addForm.price), image_ver: Date.now() };

      // รูปจากไฟล์เท่านั้น (dataURL)
      if (addForm.img && addForm.img.startsWith("data:")) {
        payload.images_data = addForm.img;
      }

      const res = await fetch(`${API_BASE}/${resName}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      await loadMenus({ reset: true });
      showToast("เพิ่มเมนูสำเร็จ");
    } catch (e) {
      setMenus((prev) => prev.filter((m) => m.id !== tempId));
      showToast(`เพิ่มเมนูล้มเหลว: ${e.message}`, "err");
    } finally {
      setAddBusy(false);
    }
  };

  /* ---------- รูปแตก → placeholder ---------- */
  const onImgError = (e) => {
    const ph = "https://placehold.co/600x400?text=No+Image";
    if (e?.target?.src && e.target.src !== ph) {
      e.target.onerror = null;
      e.target.src = ph;
    }
  };

  return (
    <div className="admin-layout">
      {/* ====== mini CSS overrides (compact) ====== */}
      <style>{`
        :root{
          --card-ar: 4/3;
          --preview-ar: 1/1;
          --preview-max: 170px;
          --modal-w: 560px;
          --fs-12: 12px;
          --fs-13: 13px;
          --fs-14: 14px;
          --radius: 12px;
        }
        .ad-main{ --ad-pad:12px; }
        .ad-header{ padding: 10px var(--ad-pad); }
        .ad-title{ font-size: 18px; }
        .ad-actions .seg-btn{ padding:6px 10px; font-size: var(--fs-13); }
        .menu-search .input{ height:34px; font-size: var(--fs-13); }
        .btn-soft,.btn-primary,.btn-ghost,.btn-outline,.btn-danger{
          padding:6px 10px; font-size: var(--fs-13); border-radius:10px;
        }

        .menu-grid{ --gap:12px; gap: var(--gap); }
        .menu-grid .menu-card{ padding:10px; border-radius: var(--radius); }
        .menu-grid .menu-card .menu-imgWrap{
          width: 100%;
          aspect-ratio: var(--card-ar);
          max-height: 140px;
          background: #f6f7f9;
          border-radius: 10px;
          overflow: hidden;
          display: flex; align-items: center; justify-content: center;
        }
        .menu-grid .menu-card .menu-imgWrap > img{
          width: 100%; height: 100%;
          object-fit: cover; object-position: center;
          display: block;
        }
        .menu-name{ font-size: 15px; font-weight: 600; margin-top:6px; }
        .menu-price{ font-size: 14px; margin-top:4px; }
        .menu-price-variants{ display:flex; flex-wrap:wrap; gap:6px; margin-top:6px; }
        .price-chip{ font-size:11px; background:#eef2ff; border:1px solid #dbe2ff; padding:2px 8px; border-radius:999px; color:#3b4aa1; }

        .row{ display:grid; grid-template-columns:auto 1fr auto; gap:6px; align-items:center; }
        .mini{ font-size: var(--fs-12); color:#98a3b5; }
        .unit{ font-size: var(--fs-12); color:#98a3b5; }

        .input{ height:34px; padding:0 10px; font-size: var(--fs-13); }
        .field{ gap:6px; }
        .field__label{ font-size: var(--fs-12); color:#9aa5b5; }

        .img-preview-wrap{
          width: 100%; aspect-ratio: var(--preview-ar);
          max-height: var(--preview-max);
          background: #f6f7f9; border-radius: 10px;
          overflow: hidden; display:flex; align-items:center; justify-content:center;
        }
        .img-preview-wrap > img{ width: 100%; height: 100%; object-fit: contain; display:block; }
        .img-preview-ph{ padding: 8px; color:#777; font-size: var(--fs-12); }

        .filepicker{
          border: 1px dashed #5c6b84; border-radius: 8px; padding: 8px;
          min-height: 44px; display:grid; grid-template-columns:auto 1fr; gap:8px; align-items:center;
          background: rgba(255,255,255,0.04);
        }
        .filepicker.is-drag{ background: rgba(255,255,255,0.08); }
        .filepicker__btn{ background:#6b7cd3; color:#fff; border:0; border-radius:8px; padding:6px 10px; cursor:pointer; font-size: var(--fs-13); }
        .filepicker__hint{ font-size: var(--fs-12); color:#aab3c5; }
        .grid-2{ display:grid; grid-template-columns:1fr 1fr; gap:10px; }

        .edit-img-tools{ display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
        .chip{ font-size:11px; padding:3px 8px; border-radius:999px; border:1px solid #ddd; }

        .ad-modal{ width: var(--modal-w); padding: 10px 12px; border-radius: 12px; }
        .ad-modal__head h3{ font-size: 16px; }
        .ad-modal__form{ display:flex; flex-direction:column; gap:10px; }
        .ad-modal__actions{ display:flex; justify-content:flex-end; gap:8px; margin-top: 6px; }

        @media (max-width: 900px){
          .grid-2{ grid-template-columns:1fr; }
          .menu-grid .menu-card .menu-imgWrap{ max-height: 120px; }
          .ad-modal{ width: min(94vw, 540px); }
        }
      `}</style>

      <aside className="ad-sidebar">
        <nav className="ad-nav">
          <NavItem icon={UserTableIcon} label="Dashboard" active={isDashboard} onClick={() => navigate("/admin")} />
          <NavItem icon={MenuIcon} label="จัดการเมนูอาหาร" active={isFoodMenu} onClick={() => navigate("/admin/menu")} />
          <NavItem icon={UsersIcon} label="จัดการการจอง (Bookings)" active={isUsers} onClick={() => navigate("/admin/users")} />
          <NavItem icon={LogoutIcon} label="ออกจากระบบ" onClick={logout} />
        </nav>
      </aside>

      <main className="ad-main">
        <header className="ad-header" style={{ position: "sticky", top: 0, zIndex: 4 }}>
          <div className="ad-profile">
            <div className="ad-avatar">
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c0-5 4-7 8-7s8 2 8 7" />
              </svg>
            </div>
            <h1 className="ad-title">จัดการเมนูอาหาร</h1>
          </div>

          <div className="ad-actions" style={{ position: "relative", zIndex: 5, gap: 8 }}>
            <div className="seg">
              <button type="button" className={`seg-btn ${type === "main" ? "is-active" : ""}`} onClick={() => setType("main")} title="/main_dishes">
                {TYPE_LABEL.main}
              </button>
              <button type="button" className={`seg-btn ${type === "snack" ? "is-active" : ""}`} onClick={() => setType("snack")} title="/snacks">
                {TYPE_LABEL.snack}
              </button>
              <button type="button" className={`seg-btn ${type === "drink" ? "is-active" : ""}`} onClick={() => setType("drink")} title="/drinks">
                {TYPE_LABEL.drink}
              </button>
            </div>

            <div className="menu-search">
              <input className="input" placeholder={`ค้นหาใน ${TYPE_LABEL[type]}...`} value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>

            <button className="btn-soft" type="button" onClick={openAdd} aria-label="เพิ่มเมนูใหม่">
              ＋ เพิ่มเมนู
            </button>
          </div>
        </header>

        <section className="ad-board">
          {toast && <div className={`ad-toast ${toast.type === "ok" ? "ok" : "err"}`}>{toast.text}</div>}
          {loading && <div className="loading">กำลังโหลด...</div>}
          {err && !loading && <div className="error">{err}</div>}

          <div className="menu-grid">
            {!loading &&
              !err &&
              filteredMenus.map((m, i) => (
                <div key={m.id ?? `row-${i}-${m.name}`} className="menu-card">
                  <div className="menu-imgWrap">
                    <img src={m.img} alt={m.name} onError={onImgError} loading="lazy" />
                  </div>

                  {editId === m.id ? (
                    <div className="menu-body" style={{ gap: 8 }}>
                      <input
                        className="input"
                        value={draft.name}
                        onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                        placeholder="ชื่อเมนู"
                      />

                      {RESOURCE_MAP[type] === "drinks" ? (
                        <>
                          <div className="row">
                            <label className="mini">ร้อน</label>
                            <input className="input" type="number" value={draft.price_hot ?? ""} onChange={(e) => setDraft((d) => ({ ...d, price_hot: e.target.value }))} placeholder="ราคา ร้อน" />
                            <span className="unit">บาท</span>
                          </div>
                          <div className="row">
                            <label className="mini">เย็น</label>
                            <input className="input" type="number" value={draft.price_iced ?? ""} onChange={(e) => setDraft((d) => ({ ...d, price_iced: e.target.value }))} placeholder="ราคา เย็น" />
                            <span className="unit">บาท</span>
                          </div>
                          <div className="row">
                            <label className="mini">ปั่น</label>
                            <input className="input" type="number" value={draft.price_frappe ?? ""} onChange={(e) => setDraft((d) => ({ ...d, price_frappe: e.target.value }))} placeholder="ราคา ปั่น" />
                            <span className="unit">บาท</span>
                          </div>
                        </>
                      ) : (
                        <div className="row">
                          <label className="mini">ราคา</label>
                          <input className="input" type="number" value={draft.price} onChange={(e) => setDraft((d) => ({ ...d, price: e.target.value }))} placeholder="ราคา" />
                          <span className="unit">บาท</span>
                        </div>
                      )}

                      {/* ลบ URL input ออก เหลือปุ่มเลือกไฟล์อย่างเดียว */}
                      <div className="edit-img-tools" style={{ marginTop: 4 }}>
                        <label className="filepicker__btn" htmlFor={`edit-file-${m.id}`}>เลือกไฟล์ใหม่</label>
                        <input id={`edit-file-${m.id}`} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => onEditFile(e.target.files?.[0])} />
                        <label className="chip" style={{ cursor: "pointer", userSelect: "none" }}>
                          <input
                            type="checkbox"
                            checked={editRemove}
                            onChange={(e) => setEditRemove(e.target.checked)}
                            disabled={!!draft.img}
                            style={{ marginRight: 6 }}
                          />
                          ลบรูปเดิม
                        </label>
                        <span className="mini">รองรับ ≤ 100MB</span>
                      </div>

                      <div className="img-preview-wrap" style={{ marginTop: 6 }}>
                        {editPreview ? (
                          <img src={editPreview} alt="preview-edit" onError={(e) => (e.currentTarget.style.opacity = 0.3)} />
                        ) : (
                          <div className="img-preview-ph">ยังไม่มีรูปพรีวิว</div>
                        )}
                      </div>

                      <div className="menu-actions" style={{ gap: 6 }}>
                        <button className="btn-primary" onClick={() => confirmEdit(m.id)} type="button" disabled={editBusy}>
                          {editBusy ? "กำลังบันทึก..." : "บันทึก"}
                        </button>
                        <button className="btn-ghost" onClick={() => setEditId(null)} type="button" disabled={editBusy}>
                          ยกเลิก
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="menu-body" style={{ gap: 6 }}>
                      <div className="menu-name">{m.name}</div>

                      {RESOURCE_MAP[type] === "drinks" ? (
                        <div className="menu-price-variants">
                          <div className="price-chip">ร้อน <b>{fmt(m?.prices?.hot)}</b></div>
                          <div className="price-chip">เย็น <b>{fmt(m?.prices?.iced)}</b></div>
                          <div className="price-chip">ปั่น <b>{fmt(m?.prices?.frappe)}</b></div>
                        </div>
                      ) : (
                        <div className="menu-price">
                          {fmt(m.price)} <span className="unit">บาท</span>
                        </div>
                      )}

                      <div className="menu-actions" style={{ gap: 6 }}>
                        <button className="btn-outline" onClick={() => startEdit(m)} type="button">แก้ไข</button>
                        <button className="btn-danger" onClick={() => deleteItem(m.id)} type="button">ลบ</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

            {!loading && !err && filteredMenus.length === 0 && (
              <div className="empty-note">ไม่พบเมนูที่ตรงกับคำค้นหา</div>
            )}
          </div>

          {!loading && !err && hasMore && (
            <div style={{ textAlign: "center", marginTop: 10 }}>
              <button className="btn-soft" type="button" onClick={() => loadMenus()}>
                โหลดเพิ่ม (+{PAGE_SIZE})
              </button>
            </div>
          )}
        </section>
      </main>

      {/* ===== Add Menu Modal ===== */}
      {adding && (
        <div className="ad-modal__backdrop" role="dialog" aria-modal="true" onClick={cancelAdd}>
          <div className="ad-modal ad-modal--elevate" onClick={(e) => e.stopPropagation()}>
            <div className="ad-modal__head"><h3>เพิ่มเมนูใหม่ — {TYPE_LABEL[type]}</h3></div>

            <div className="ad-modal__form">
              <label className="field">
                <span className="field__label">ชื่อเมนู</span>
                <input
                  className="input"
                  value={addForm.name}
                  onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="เช่น ชาไทย, ไก่ทอด, ข้าวกะเพรา"
                  autoFocus
                />
              </label>

              {RESOURCE_MAP[type] === "drinks" ? (
                <>
                  <div className="grid-2">
                    <label className="field">
                      <span className="field__label">ร้อน (บาท)</span>
                      <input className="input" type="number" min="0" step="1" value={addForm.price_hot}
                        onChange={(e) => setAddForm((f) => ({ ...f, price_hot: e.target.value }))} placeholder="เช่น 25" />
                    </label>
                    <label className="field">
                      <span className="field__label">เย็น (บาท)</span>
                      <input className="input" type="number" min="0" step="1" value={addForm.price_iced}
                        onChange={(e) => setAddForm((f) => ({ ...f, price_iced: e.target.value }))} placeholder="เช่น 30" />
                    </label>
                  </div>
                  <label className="field">
                    <span className="field__label">ปั่น (บาท)</span>
                    <input className="input" type="number" min="0" step="1" value={addForm.price_frappe}
                      onChange={(e) => setAddForm((f) => ({ ...f, price_frappe: e.target.value }))} placeholder="เช่น 35" />
                  </label>
                </>
              ) : (
                <label className="field">
                  <span className="field__label">ราคา (บาท)</span>
                  <input
                    className="input" type="number" min="0" step="1" value={addForm.price}
                    onChange={(e) => setAddForm((f) => ({ ...f, price: e.target.value }))} placeholder="เช่น 65"
                  />
                </label>
              )}

              {/* ลบช่องวาง URL ออก เหลือเลือกไฟล์ + Preview */}
              <div className="field">
                <span className="field__label">เลือกรูป (ไม่บังคับ)</span>
                <div
                  className={`filepicker ${dragOver ? "is-drag" : ""}`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onDrop}
                >
                  <input id="add-file" type="file" accept="image/*" className="filepicker__input"
                    onChange={(e) => onAddFile(e.target.files?.[0])} />
                  <label className="filepicker__btn" htmlFor="add-file">เลือกไฟล์</label>
                  <div className="filepicker__hint">ลากไฟล์มาวาง / คลิกเลือกไฟล์ (≤ 100MB)</div>
                </div>
              </div>

              <div className="img-preview-wrap">
                {addPreview ? (
                  <img src={addPreview} alt="preview" onError={(e) => (e.currentTarget.style.opacity = 0.3)} />
                ) : (
                  <div className="img-preview-ph">ยังไม่มีรูปพรีวิว</div>
                )}
              </div>

              <div className="ad-modal__actions">
                <button className="btn-primary" type="button" onClick={confirmAdd} disabled={addBusy}>
                  {addBusy ? "กำลังบันทึก..." : "บันทึก"}
                </button>
                <button className="btn-ghost" type="button" onClick={cancelAdd} disabled={addBusy}>
                  ยกเลิก
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Icons / Nav ---------- */
function NavItem({ icon: Icon, label, active, onClick }) {
  return (
    <button className={`ad-nav__item ${active ? "is-active" : ""}`} onClick={onClick} type="button">
      <Icon />
      <span>{label}</span>
    </button>
  );
}
function UserTableIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  );
}
function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 6h16M4 12h10M4 18h16" />
    </svg>
  );
}
/* FIX: UsersIcon paths ถูกต้อง (ไม่ใช้ arc ผิดรูป) */
function UsersIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M3 21c0-4 4-6 9-6s9 2 9 6" />
    </svg>
  );
}
function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}
