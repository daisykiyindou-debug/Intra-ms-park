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
  ShieldCheck,
  ClipboardList,
  Inbox,
  BarChart3,
  Megaphone,
  ListChecks,
  Edit3,
  Mail,
  Camera,
  Cake,
  Lightbulb,
  Receipt,
  Clock,
  GraduationCap,
  LifeBuoy,
  HelpCircle,
  DoorOpen,
} from "lucide-react";
import { useApp, hasPermission } from "@/contexts/AppContext";

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
  { to: "/salles", label: "Salles de réunion", icon: DoorOpen, key: "meeting-rooms" },
  { to: "/avantages", label: "CSE & Avantages", icon: Gift, key: "cse" },
  { to: "/agenda", label: "Agenda", icon: Calendar, key: "agenda" },
  { to: "/formations", label: "Formation", icon: GraduationCap, key: "formations" },
  { to: "/galerie", label: "Galerie photos", icon: Camera, key: "gallery" },
  { to: "/idees", label: "Boîte à idées", icon: Lightbulb, key: "ideas" },
  { to: "/anniversaires", label: "Anniversaires", icon: Cake, key: "birthdays" },

  { divider: "Support & IT" },
  { to: "/support", label: "Support Informatique", icon: LifeBuoy, key: "support" },
  { to: "/aide", label: "Centre d'aide", icon: HelpCircle, key: "help" },
];

// Each admin nav item can carry a `perm` array. Full admins bypass filtering.
// Items sorted alphabetically by label (Vue d'ensemble kept first as overview).
const adminNav = [
  { divider: "Management", adminBadge: true },
  { to: "/management", label: "Vue d'ensemble", icon: BarChart3, key: "mgmt-overview", perm: ["view_stats"] },
  { to: "/actualites", label: "Actualités (rédaction)", icon: Newspaper, key: "mgmt-news", perm: ["publish_news", "edit_news"] },
  { to: "/management/agenda", label: "Agenda", icon: Calendar, key: "mgmt-agenda", perm: ["create_events", "edit_events"] },
  { to: "/management/idees", label: "Boîte à idées", icon: Lightbulb, key: "mgmt-ideas" },
  { to: "/management/carrousel", label: "Carrousel accueil", icon: Newspaper, key: "mgmt-carrousel", perm: ["manage_carousel"] },
  { to: "/management/fiches-de-paie", label: "Fiches de paie", icon: FileText, key: "mgmt-payslips", perm: ["view_payslips"] },
  { to: "/management/formations", label: "Formations", icon: GraduationCap, key: "mgmt-formations" },
  { to: "/management/formulaires", label: "Formulaires", icon: ListChecks, key: "mgmt-forms", perm: ["create_forms"] },
  { to: "/management/heures-supp", label: "Heures supp. & récup.", icon: Clock, key: "mgmt-overtime", perm: ["approve_recovery"] },
  { to: "/newsletters", label: "Newsletters", icon: Mail, key: "mgmt-newsletters", perm: ["manage_newsletter"] },
  { to: "/management/notes-de-frais", label: "Notes de frais", icon: Receipt, key: "mgmt-expenses", perm: ["view_expenses", "approve_expenses"] },
  { to: "/management/planning", label: "Plannings employés", icon: ClipboardList, key: "mgmt-planning", perm: ["manage_users", "approve_leaves"] },
  { to: "/management/documents-editor", label: "Rédiger documents", icon: Edit3, key: "mgmt-hrdocs", perm: ["manage_documents", "publish_documents"] },
  { to: "/management/restauration", label: "Restauration (menu)", icon: UtensilsCrossed, key: "mgmt-restauration" },
  { to: "/management/attributions", label: "RTT / CP", icon: Gift, key: "mgmt-rtt", perm: ["approve_leaves"] },
  { to: "/management/salles", label: "Salles de réunion", icon: DoorOpen, key: "mgmt-rooms" },
  { to: "/management/support", label: "Support IT (tickets)", icon: LifeBuoy, key: "mgmt-support", perm: ["view_tickets", "reply_tickets"] },
  { to: "/management/utilisateurs", label: "Utilisateurs", icon: Users, key: "mgmt-users", perm: ["manage_users"] },
  { to: "/management/demandes", label: "Validation demandes", icon: Inbox, key: "mgmt-demandes", perm: ["approve_leaves", "approve_recovery"] },
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

  // Filter admin nav items by permission. Admins (and full_admin) get everything;
  // other users only get items whose `perm` matches one of their permissions.
  const filterByPerm = (nav) => {
    if (isAdmin) return nav;
    // Remove leading/trailing dividers left orphaned after filtering
    const filtered = nav.filter((it) => {
      if (it.divider) return true;
      if (!it.perm) return false; // items without explicit perm are admin-only
      return hasPermission(me, ...it.perm);
    });
    // Drop dividers not followed by at least one item
    const cleaned = filtered.filter((it, i) => {
      if (!it.divider) return true;
      const next = filtered[i + 1];
      return next && !next.divider;
    });
    return cleaned;
  };

  // Non-admin users with granular permissions also see the filtered admin section
  const hasAnyMgmtPerm = !isAdmin && !isSuperAdmin && me?.permissions?.some?.((p) =>
    ["publish_news", "edit_news", "manage_carousel", "manage_newsletter", "create_events",
      "edit_events", "manage_documents", "publish_documents", "view_payslips", "create_forms",
      "view_tickets", "reply_tickets", "manage_users", "approve_leaves", "approve_recovery",
      "view_expenses", "approve_expenses", "export_data", "view_stats", "full_admin", "add_gallery"].includes(p)
  );

  const tagSection = (arr, section) => arr.map((it) => it.divider ? it : ({ ...it, section }));

  // Deduplicate items by their `to` URL — some users (e.g. Chargée de
  // communication with extra granular perms) match items both in commNav and
  // in adminNav. First occurrence wins to preserve the intended section order.
  const dedupeByTo = (arr) => {
    const seen = new Set();
    return arr.filter((it) => {
      if (it.divider || !it.to) return true;
      if (seen.has(it.to)) return false;
      seen.add(it.to);
      return true;
    });
  };

  const rawItems = isSuperAdmin
    ? [...superAdminBase, ...(showAdmin ? tagSection(adminNav, "admin") : [])]
    : isAdmin
    ? [...employeeNav, ...(showAdmin ? tagSection(adminNav, "admin") : [])]
    : isComm
    ? [...employeeNav, ...(showAdmin ? [...tagSection(commNav, "comm"), ...tagSection(filterByPerm(adminNav).filter((i) => !i.divider), "admin")] : [])]
    : hasAnyMgmtPerm && showAdmin
    ? [...employeeNav, ...tagSection(filterByPerm(adminNav), "admin")]
    : employeeNav;

  const items = dedupeByTo(rawItems);

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
        <div className="flex h-24 items-center gap-3 px-5 border-b border-white/5">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.06] border border-white/10 backdrop-blur-md p-2 shadow-lg shadow-[#3BA4FF]/15 shrink-0">
            <img
              src="https://customer-assets-jt897jd0.emergentagent.net/job_mspark-employee-hub/artifacts/n4qg1w02_logo%20ms%20park%20transparent.png"
              alt="MS Park"
              className="h-full w-full object-contain"
              data-testid="sidebar-brand-logo"
            />
          </div>
          <div>
            <div className="text-xl font-extrabold tracking-tight leading-none">MS Park</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/50 mt-1.5">Intranet</div>
          </div>
        </div>

        <nav className="px-3 py-4 space-y-0.5 overflow-y-auto" style={{ height: "calc(100vh - 6rem - 5rem)" }}>
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
                className={({ isActive }) => {
                  const isAdminItem = item.section === "admin";
                  const isCommItem = item.section === "comm";
                  const base = "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200";
                  if (isActive) {
                    if (isAdminItem) return `${base} bg-[#A78BFA]/20 text-white shadow-inner`;
                    if (isCommItem) return `${base} bg-[#F59E0B]/20 text-white shadow-inner`;
                    return `${base} bg-[#3BA4FF]/15 text-white shadow-inner`;
                  }
                  if (isAdminItem) return `${base} text-[#DDD6FE] hover:text-white hover:bg-[#A78BFA]/10 border-l-2 border-[#A78BFA]/30 ml-1`;
                  if (isCommItem) return `${base} text-[#FDE68A] hover:text-white hover:bg-[#F59E0B]/10 border-l-2 border-[#F59E0B]/30 ml-1`;
                  return `${base} text-white/70 hover:text-white hover:bg-white/5`;
                }}
              >
                {({ isActive }) => {
                  const isAdminItem = item.section === "admin";
                  const isCommItem = item.section === "comm";
                  let iconCls = "text-white/60 group-hover:text-white";
                  if (isActive) {
                    iconCls = isAdminItem ? "text-[#A78BFA]"
                      : isCommItem ? "text-[#F59E0B]"
                      : "text-[#3BA4FF]";
                  } else if (isAdminItem) {
                    iconCls = "text-[#A78BFA] group-hover:text-white";
                  } else if (isCommItem) {
                    iconCls = "text-[#F59E0B] group-hover:text-white";
                  }
                  const dotCls = isAdminItem ? "bg-[#A78BFA]"
                    : isCommItem ? "bg-[#F59E0B]"
                    : "bg-[#3BA4FF]";
                  return (
                    <>
                      <item.icon className={`h-[18px] w-[18px] transition-colors ${iconCls}`} strokeWidth={2} />
                      <span>{item.label}</span>
                      {isActive && <span className={`ml-auto h-1.5 w-1.5 rounded-full animate-pulse ${dotCls}`} />}
                    </>
                  );
                }}
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
