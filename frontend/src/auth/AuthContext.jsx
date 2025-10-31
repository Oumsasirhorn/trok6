// src/auth/AuthContext.jsx
import { createContext, useContext, useEffect, useState } from "react";

const AuthContext = createContext(null);
const KEY = "admin_session";

/* ===== API BASE: ดึงจาก Vite ENV ===== */
const RAW = import.meta.env.VITE_API_BASE || "http://localhost:5000";
const API = RAW.replace(/[,\s]+$/, "").replace(/\/+$/, "");

export function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  // โหลด session จาก localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data?.username) {
          setAdmin(data);
          setIsAuthenticated(true);
        } else {
          localStorage.removeItem(KEY);
        }
      }
    } catch {
      localStorage.removeItem(KEY);
    } finally {
      setLoading(false);
    }
  }, []);

  // เรียก API จริงในการ login (ชี้ไปที่ production ผ่าน VITE_API_BASE)
  const login = async (username, password) => {
    try {
      const res = await fetch(`${API}/admins/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // ถ้า backend ใช้คุกกี้ session ให้เปิดบรรทัดนี้ด้วย
        // credentials: "include",
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { ok: false, message: data?.message || "เข้าสู่ระบบไม่สำเร็จ" };
      }

      const profile = {
        admin_id: data.admin_id,
        username: data.username,
      };
      localStorage.setItem(KEY, JSON.stringify(profile));
      setAdmin(profile);
      setIsAuthenticated(true);
      return { ok: true };
    } catch (err) {
      return { ok: false, message: "เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์" };
    }
  };

  const logout = () => {
    localStorage.removeItem(KEY);
    setAdmin(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider
      value={{ admin, isAuthenticated, loading, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
