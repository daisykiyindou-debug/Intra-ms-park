import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  UtensilsCrossed,
  ShoppingBag,
  CalendarDays,
  Fingerprint,
  FileText,
  Newspaper,
  MessageSquare,
  Folder,
  Calendar,
  Gift,
  Users,
  User,
  Sparkles,
  ShieldCheck,
  ClipboardList,
  Inbox,
  BarChart3,
  Gift,
  FileText,
  Megaphone,
} from "lucide-react";
import { useApp } from "@/contexts/AppContext";

const nav = [
  { to: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard, key: "dashboard" },
  { to: "/profil", label: "Mon profil", icon: User, key: "profil" },
  { to: "/points-repas", label: "Points repas", icon: UtensilsCrossed, key: "points" },
  { to: "/restaurant", label: "Restauration", icon: ShoppingBag, key: "restaurant" },
  { divider: "Mon Coin RH" },
  { to: "/rh/planning", label: "Planning", icon: CalendarDays, key: "planning" },
  { to: "/rh/badgeage", label: "Badge", icon: Fingerprint, key: "badge" },
  { to: "/rh/demandes", label: "Demandes RH", icon: FileText, key: "demandes" },
  { divider: "Entreprise" },
  { to: "/actualites", label: "Actualités", icon: Newspaper, key: "news" },
  { to: "/messagerie", label: "Messagerie", icon: MessageSquare, key: "messagerie" },
  { to: "/documents", label: "Documents RH", icon: Folder, key: "documents" },
  { to: "/agenda", label: "Agenda", icon: Calendar, key: "agenda" },
  { to: "/avantages", label: "Avantages", icon: Gift, key: "avantages" },
  { to: "/contacts", label: "Contacts", icon: Users, key: "contacts" },
];

const adminNav = [
  { divider: "Management", adminBadge: true },
  { to: "/management", label: "Vue d'ensemble", icon: BarChart3, key: "mgmt-overview" },
  { to: "/management/planning", label: "Plannings employés", icon: ClipboardList, key: "mgmt-planning" },
  { to: "/management/demandes", label: "Validation demandes", icon: Inbox, key: "mgmt-demandes" },
  { to: "/management/attributions", label: "RTT / CP", icon: Gift, key: "mgmt-rtt" },
  { to: "/management/actualites", label: "Actualités", icon: Newspaper, key: "mgmt-news" },
  { to: "/management/documents", label: "Documents RH", icon: FileText, key: "mgmt-docs" },
  { to: "/management/fil", label: "Fil MS Park", icon: Megaphone, key: "mgmt-fil" },
];

export default function Sidebar({ open, onClose }) {
  const { me } = useApp();
  const isAdmin = !!me?.is_admin;
  const items = isAdmin ? [...nav, ...adminNav] : nav;

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <button
          aria-label="Fermer le menu"
          onClick={onClose}
          data-testid="sidebar-overlay"
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm md:hidden"
        />
      )}
      <aside
        data-testid="sidebar"
        className={`fixed left-0 top-0 z-50 h-screen w-72 transform bg-[#071B34] text-white transition-transform duration-300 ease-out md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-20 items-center gap-3 px-6 border-b border-white/5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#3BA4FF] to-[#1D70B8] shadow-lg shadow-[#3BA4FF]/25">
            <Sparkles className="h-5 w-5 text-white" strokeWidth={2.5} />
          </div>
          <div>
            <div className="text-lg font-extrabold tracking-tight leading-none">MS Park</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/50 mt-1">Intranet</div>
          </div>
        </div>

        <nav className="px-3 py-4 space-y-0.5 overflow-y-auto" style={{ height: "calc(100vh - 5rem - 5rem)" }}>
          {items.map((item, i) =>
            item.divider ? (
              <div
                key={`d-${i}`}
                className={`px-3 pt-5 pb-2 text-[10px] uppercase tracking-[0.2em] font-semibold flex items-center gap-1.5 ${
                  item.adminBadge ? "text-[#A78BFA]" : "text-white/40"
                }`}
              >
                {item.adminBadge && <ShieldCheck className="h-3 w-3" />}
                {item.divider}
              </div>
            ) : (
              <NavLink
                key={item.key}
                to={item.to}
                onClick={onClose}
                data-testid={`nav-${item.key}`}
                className={({ isActive }) =>
                  `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-[#3BA4FF]/15 text-white shadow-inner"
                      : "text-white/70 hover:text-white hover:bg-white/5"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <item.icon
                      className={`h-[18px] w-[18px] transition-colors ${
                        isActive ? "text-[#3BA4FF]" : "text-white/60 group-hover:text-white"
                      }`}
                      strokeWidth={2}
                    />
                    <span>{item.label}</span>
                    {isActive && (
                      <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#3BA4FF] animate-pulse" />
                    )}
                  </>
                )}
              </NavLink>
            )
          )}
        </nav>

        {me && (
          <div className="absolute bottom-0 left-0 right-0 px-4 py-4 border-t border-white/5">
            <div className="flex items-center gap-3 rounded-xl bg-white/[0.03] p-3">
              <div className="relative">
                <img
                  src={me.avatar}
                  alt={me.first_name}
                  className="h-10 w-10 rounded-full object-cover ring-2 ring-[#3BA4FF]/40"
                  data-testid="sidebar-user-avatar"
                />
                {isAdmin && (
                  <span
                    className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#A78BFA] ring-2 ring-[#071B34]"
                    title="Administrateur"
                  >
                    <ShieldCheck className="h-3 w-3 text-white" />
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white">
                  {me.first_name} {me.last_name}
                </div>
                <div className="truncate text-xs text-white/50">
                  {isAdmin ? "Administrateur · " : ""}
                  {me.role}
                </div>
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
