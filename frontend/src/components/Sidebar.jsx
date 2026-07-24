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
  Megaphone,
  ListChecks,
  Edit3,
  Mail,
  Camera,
  Receipt,
  Clock,
  GraduationCap,
  LifeBuoy,
  HelpCircle,
} from "lucide-react";
import { useApp } from "@/contexts/AppContext";

// ─── Employee nav: grouped by section
const employeeNav = [
  { to: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard, key: "dashboard" },
  { to: "/profil", label: "Mon profil", icon: User, key: "profil" },

  { divider: "Communication" },
  { to: "/actualites", label: "Actualités", icon: Newspaper, key: "news" },
  { to: "/newsletters", label: "Newsletters", icon: Mail, key: "newsletters" },
  { to: "/messagerie", label: "Messagerie", icon: MessageSquare, key: "messagerie" },
  { to: "/contacts", label: "Contacts", icon: Users, key: "contacts" },

  { divider: "Ressources humaines" },
  { to: "/rh/planning", label: "Planning", icon: CalendarDays, key: "planning" },
  { to: "/rh/badgeage", label: "Badge", icon: Fingerprint, key: "badge" },
  { to: "/rh/demandes", label: "Congés et absences", icon: FileText, key: "demandes" },
  { to: "/notes-de-frais", label: "Notes de frais", icon: Receipt, key: "expenses" },
  { to: "/documents", label: "Documents", icon: Folder, key: "documents" },

  { divider: "Points repas" },
  { to: "/restaurant", label: "Restauration", icon: ShoppingBag, key: "restaurant" },

  { divider: "Vie de l'entreprise" },
  { to: "/avantages", label: "CSE & Avantages", icon: Gift, key: "cse" },
  { to: "/agenda", label: "Agenda", icon: Calendar, key: "agenda" },
  { to: "/formations", label: "Formation", icon: GraduationCap, key: "formations" },
  { to: "/galerie", label: "Galerie photos", icon: Camera, key: "gallery" },

  { divider: "Support & IT" },
  { to: "/support", label: "Support Informatique", icon: LifeBuoy, key: "support" },
  { to: "/aide", label: "Centre d'aide", icon: HelpCircle, key: "help" },
];

const adminNav = [
  { divider: "Management", adminBadge: true },
  { to: "/management", label: "Vue d'ensemble", icon: BarChart3, key: "mgmt-overview" },
  { to: "/management/planning", label: "Plannings employés", icon: ClipboardList, key: "mgmt-planning" },
  { to: "/management/demandes", label: "Validation demandes", icon: Inbox, key: "mgmt-demandes" },
  { to: "/management/attributions", label: "RTT / CP", icon: Gift, key: "mgmt-rtt" },
  { to: "/management/notes-de-frais", label: "Notes de frais", icon: Receipt, key: "mgmt-expenses" },
  { to: "/management/heures-supp", label: "Heures supp. & récup.", icon: Clock, key: "mgmt-overtime" },
  { to: "/management/restauration", label: "Restauration (menu)", icon: UtensilsCrossed, key: "mgmt-restauration" },
  { to: "/management/formations", label: "Formations", icon: GraduationCap, key: "mgmt-formations" },
  { to: "/management/support", label: "Support IT (tickets)", icon: LifeBuoy, key: "mgmt-support" },
  { to: "/management/carrousel", label: "Carrousel accueil", icon: Newspaper, key: "mgmt-carrousel" },
  { to: "/management/agenda", label: "Agenda", icon: Calendar, key: "mgmt-agenda" },
  { to: "/management/formulaires", label: "Formulaires", icon: ListChecks, key: "mgmt-forms" },
  { to: "/management/utilisateurs", label: "Utilisateurs", icon: Users, key: "mgmt-users" },
  { to: "/management/fiches-de-paie", label: "Fiches de paie", icon: FileText, key: "mgmt-payslips" },
  { to: "/management/documents-editor", label: "Rédiger documents", icon: Edit3, key: "mgmt-hrdocs" },
  { to: "/newsletters", label: "Newsletters", icon: Mail, key: "mgmt-newsletters" },
  { to: "/actualites", label: "Actualités (rédaction)", icon: Newspaper, key: "mgmt-news" },
];

const commNav = [
  { divider: "Communication", commBadge: true },
  { to: "/management/carrousel", label: "Carrousel accueil", icon: Newspaper, key: "comm-carrousel" },
  { to: "/management/agenda", label: "Agenda", icon: Calendar, key: "comm-agenda" },
  { to: "/management/formulaires", label: "Formulaires", icon: ListChecks, key: "comm-forms" },
];

// Super admin: only admin features + dashboard (no employee-side items)
const superAdminBase = [
  { to: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard, key: "dashboard" },
  { to: "/profil", label: "Mon profil", icon: User, key: "profil" },
  { to: "/newsletters", label: "Newsletters (compte MS Park)", icon: Mail, key: "sa-newsletters" },
  { to: "/actualites", label: "Actualités (compte MS Park)", icon: Newspaper, key: "sa-news" },
];

export default function Sidebar({ open, onClose }) {
  const { me, adminMode } = useApp();
  const isSuperAdmin = !!me?.is_super_admin;
  const isAdmin = !!me?.is_admin;
  const isComm = !!me?.can_manage_communication && !isAdmin;
  const showAdmin = adminMode !== false; // default true; when toggled off, hide admin nav

  const items = isSuperAdmin
    ? [...superAdminBase, ...(showAdmin ? adminNav : [])]
    : isAdmin
    ? [...employeeNav, ...(showAdmin ? adminNav : [])]
    : isComm
    ? [...employeeNav, ...(showAdmin ? commNav : [])]
    : employeeNav;

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
                  item.adminBadge
                    ? "text-[#A78BFA]"
                    : item.commBadge
                    ? "text-[#F59E0B]"
                    : "text-white/40"
                }`}
              >
                {item.adminBadge && <ShieldCheck className="h-3 w-3" />}
                {item.commBadge && <Megaphone className="h-3 w-3" />}
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
                {!isAdmin && isComm && (
                  <span
                    className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#F59E0B] ring-2 ring-[#071B34]"
                    title="Chargée de communication"
                  >
                    <Megaphone className="h-3 w-3 text-white" />
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white">
                  {me.first_name} {me.last_name}
                </div>
                <div className="truncate text-xs text-white/50">
                  {isAdmin ? "Administrateur · " : isComm ? "Communication · " : ""}
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
