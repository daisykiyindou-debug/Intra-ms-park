import { useEffect, useRef, useState } from "react";
import { Bell, Menu, Search, LogOut, User, ShieldCheck, Cake } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";
import { api, setAuthId } from "@/lib/api";

export default function Header({ onMenuClick, onNotifClick }) {
  const { me, notifications, adminMode, toggleAdminMode } = useApp();
  const canToggleAdmin = !!me && (me.is_admin || me.can_manage_communication);
  const unread = notifications.filter((n) => !n.read).length;
  const [open, setOpen] = useState(false);
  const [isBirthday, setIsBirthday] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!me?.id) return;
    api.get("/me/birthday").then((r) => setIsBirthday(!!r.data?.is_birthday_today)).catch(() => {});
  }, [me?.id]);

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const logout = () => {
    setAuthId(null);
    localStorage.setItem("ms_logged_out", "1");
    window.location.href = "/login";
  };

  return (
    <header
      data-testid="top-header"
      className="sticky top-0 z-30 flex h-20 items-center gap-4 px-4 md:px-8 backdrop-blur-xl bg-[#F4F7FA]/85 border-b border-[#071B34]/5"
    >
      <button
        onClick={onMenuClick}
        data-testid="menu-button"
        className="md:hidden flex h-10 w-10 items-center justify-center rounded-xl text-[#071B34] hover:bg-[#071B34]/5 transition-colors"
        aria-label="Ouvrir le menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="hidden md:flex items-center gap-2 max-w-md flex-1">
        <div className="relative w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#475569]" />
          <input
            data-testid="search-input"
            placeholder="Rechercher dans l'intranet…"
            className="w-full rounded-xl bg-white border border-[#071B34]/8 pl-10 pr-4 py-2.5 text-sm placeholder:text-[#475569] focus:ring-2 focus:ring-[#3BA4FF]/30 focus:border-[#3BA4FF] outline-none transition-all"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden md:inline-flex items-center gap-1 rounded-md border border-[#071B34]/10 bg-[#F4F7FA] px-1.5 py-0.5 font-mono text-[10px] font-medium text-[#475569]">
            ⌘K
          </kbd>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2 md:gap-3">
        {canToggleAdmin && (
          <button
            onClick={toggleAdminMode}
            data-testid="admin-mode-toggle"
            title={adminMode ? "Passer en vue employé" : "Activer le mode administrateur"}
            className={`hidden sm:inline-flex items-center gap-2 rounded-xl px-3 h-10 border transition-all ${
              adminMode
                ? "bg-[#3BA4FF] border-[#3BA4FF] text-white shadow-[0_4px_14px_rgba(59,164,255,0.35)]"
                : "bg-white border-[#071B34]/8 text-[#475569] hover:border-[#3BA4FF]/40"
            }`}
          >
            <ShieldCheck className="h-4 w-4" />
            <span className="text-xs font-semibold">Admin</span>
            <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${adminMode ? "bg-white/30" : "bg-[#94A3B8]/30"}`}>
              <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${adminMode ? "translate-x-4" : "translate-x-0.5"}`} />
            </span>
          </button>
        )}
        <button
          onClick={onNotifClick}
          data-testid="notif-button"
          className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-white border border-[#071B34]/8 hover:border-[#3BA4FF]/40 hover:shadow-[0_4px_14px_rgba(59,164,255,0.15)] transition-all"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4 text-[#071B34]" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#EF4444] px-1 text-[10px] font-bold text-white shadow-md">
              {unread}
            </span>
          )}
        </button>

        {me && (
          <div ref={ref} className="relative">
            <button
              onClick={() => setOpen((o) => !o)}
              data-testid="profile-dropdown"
              className="flex items-center gap-3 pl-2 md:pl-3 border-l border-[#071B34]/8 cursor-pointer rounded-xl hover:bg-[#071B34]/5 px-2 py-1 transition-colors"
            >
              <div className="hidden md:block text-right">
                <div className="text-sm font-semibold text-[#071B34] leading-tight inline-flex items-center gap-1.5">
                  {me.first_name} {me.last_name}
                  {isBirthday && (
                    <span
                      title="C'est votre anniversaire aujourd'hui !"
                      className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-gradient-to-br from-[#F0ABFC] to-[#A78BFA] text-white shadow-sm animate-pulse"
                      data-testid="header-birthday-cake"
                    >
                      <Cake className="h-3 w-3" />
                    </span>
                  )}
                </div>
                <div className="text-xs text-[#475569]">{me.role}</div>
              </div>
              <img
                src={me.avatar}
                alt={me.first_name}
                data-testid="header-avatar"
                className="h-10 w-10 rounded-full object-cover ring-2 ring-white shadow-md"
              />
            </button>
            {open && (
              <div
                data-testid="profile-menu"
                className="absolute right-0 top-full mt-2 w-56 rounded-2xl bg-white border border-[#071B34]/8 shadow-xl overflow-hidden ms-fade-up"
              >
                <div className="p-3 border-b border-[#071B34]/5">
                  <div className="text-sm font-semibold text-[#071B34]">{me.first_name} {me.last_name}</div>
                  <div className="text-[11px] text-[#475569] truncate">{me.role}</div>
                </div>
                <Link
                  to="/profil"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 px-3 py-2.5 text-sm text-[#071B34] hover:bg-[#F4F7FA] transition-colors"
                >
                  <User className="h-4 w-4 text-[#475569]" /> Mon profil
                </Link>
                <button
                  onClick={logout}
                  data-testid="logout-btn"
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-[#EF4444] hover:bg-[#FEE2E2] transition-colors"
                >
                  <LogOut className="h-4 w-4" /> Se déconnecter
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
