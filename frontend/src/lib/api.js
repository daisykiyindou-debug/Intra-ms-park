import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

/**
 * Turn a relative asset URL (from POST /api/uploads) into an absolute URL
 * hitting the backend through the ingress. External URLs pass through.
 */
export const absoluteUrl = (u) => {
  if (!u) return u;
  if (u.startsWith("http") || u.startsWith("data:")) return u;
  return `${BACKEND_URL}${u.startsWith("/") ? "" : "/"}${u}`;
};

export const api = axios.create({
  baseURL: API,
  headers: { "Content-Type": "application/json" },
});

// ── Auth (mock) ──────────────────────────────────────────────────
// The frontend stores the connected employee_id in localStorage and
// forwards it to the backend via the X-Employee-Id header.
const AUTH_KEY = "ms_employee_id";
export const getAuthId = () =>
  (typeof window !== "undefined" && localStorage.getItem(AUTH_KEY)) || "emp-idriss-malonga";
export const setAuthId = (id) => {
  if (typeof window === "undefined") return;
  if (id) localStorage.setItem(AUTH_KEY, id);
  else localStorage.removeItem(AUTH_KEY);
};

api.interceptors.request.use((config) => {
  config.headers["X-Employee-Id"] = getAuthId();
  return config;
});

// ── helpers used across pages ─────────────────────────────────────
export const formatMinutes = (mins) => {
  const h = Math.floor((mins || 0) / 60);
  const m = (mins || 0) % 60;
  return `${h}h${m.toString().padStart(2, "0")}`;
};

export const statusMeta = {
  service: { label: "En service", color: "#10B981", bg: "#D1FAE5", icon: "circle-dot" },
  pause: { label: "En pause", color: "#F59E0B", bg: "#FEF3C7", icon: "pause-circle" },
  hors_site: { label: "Hors site", color: "#64748B", bg: "#F1F5F9", icon: "map-pin-off" },
  end: { label: "Fin de service", color: "#3BA4FF", bg: "#E0F2FE", icon: "check-circle" },
  off: { label: "Jour OFF", color: "#94A3B8", bg: "#F1F5F9", icon: "moon" },
};

export const roleQuotaLabel = (cat) => {
  if (cat === "restauration") return "Restauration · 30 pts/jour";
  if (cat === "encadrement") return "Encadrement · 35 pts/jour";
  return "Employé · 20 pts/jour";
};

export const fr = {
  months: [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
  ],
  daysShort: ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"],
  daysLong: ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"],
};

export const formatDateFr = (isoOrDate) => {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  const day = d.getDate();
  const month = fr.months[d.getMonth()];
  return `${day} ${month} ${d.getFullYear()}`;
};
