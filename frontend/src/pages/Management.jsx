import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink, Route, Routes, Navigate } from "react-router-dom";
import {
  BarChart3, ClipboardList, Inbox, Newspaper, ShieldCheck, ArrowRight,
  Users as UsersIcon, AlertTriangle, CheckCircle2, TrendingUp, ChevronLeft, ChevronRight,
  Plus, Trash2, Save, X, CalendarDays, CalendarClock, Clock, MessageCircle, Gift, Sparkles,
  FileText, Receipt, Send, Megaphone, GripVertical, UtensilsCrossed, Lightbulb,
} from "lucide-react";
import { toast } from "sonner";

// Shared modal wrapper — rendered via portal to escape any ancestor `transform`
// (e.g. `.ms-fade-up` on Management pages) that would otherwise capture `position: fixed`.
function PortalModal({ onClose, children }) {
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-md flex items-center justify-center p-4"
    >
      {children}
    </div>,
    document.body
  );
}

import { api, fr, formatMinutes, absoluteUrl } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";
import { notifyLiveRefresh } from "@/hooks/useLiveData";
import FormBuilder from "@/pages/FormBuilder";
import UserManager from "@/pages/UserManager";
import { ExpensesManager } from "@/pages/NotesDeFrais";
import { HRDocsManager, HRDocEditor } from "@/pages/HRDocs";
import OvertimeManager from "@/pages/OvertimeManager";
import { FormationsManager } from "@/pages/Formations";
import SupportITList from "@/pages/Support";
import RestaurationManager from "@/pages/RestaurationManager";
import PayslipsManager from "@/pages/PayslipsManager";
import IdeasAdmin from "@/pages/IdeasAdmin";
import PartnersManager from "@/pages/PartnersManager";
import AdminSalles from "@/pages/AdminSalles";
import { AudiencePicker } from "@/pages/Actualites";
import ImageUpload from "@/components/ImageUpload";

const subNav = [
  { to: "/management", label: "Vue d'ensemble", icon: BarChart3, end: true },
  { to: "/management/planning", label: "Plannings", icon: ClipboardList },
  { to: "/management/demandes", label: "Demandes", icon: Inbox },
  { to: "/management/attributions", label: "RTT / CP", icon: Gift },
  { to: "/management/notes-de-frais", label: "Notes de frais", icon: FileText },
  { to: "/management/heures-supp", label: "Heures supp.", icon: FileText },
  { to: "/management/restauration", label: "Restauration", icon: UtensilsCrossed },
  { to: "/management/carrousel", label: "Carrousel accueil", icon: Newspaper },
  { to: "/management/agenda", label: "Agenda", icon: CalendarDays },
  { to: "/management/formulaires", label: "Formulaires", icon: FileText },
  { to: "/management/utilisateurs", label: "Utilisateurs", icon: UsersIcon },
  { to: "/management/fiches-de-paie", label: "Fiches de paie", icon: FileText },
  { to: "/management/documents-editor", label: "Rédiger documents", icon: FileText },
  { to: "/management/idees", label: "Boîte à idées", icon: Lightbulb },
  { to: "/management/avantages", label: "CSE & Avantages", icon: Gift },
];

const isoDate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const mondayOf = (d) => {
  const date = new Date(d);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return date;
};
const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

export default function ManagementShell() {
  const { me } = useApp();

  const isAdmin = !!me?.is_admin;
  const isComm = !!me?.can_manage_communication;
  // A regular user with any management-scoped permission also gets access.
  const hasAnyMgmtPerm = !!me?.permissions?.some?.((p) =>
    ["publish_news", "edit_news", "manage_carousel", "manage_newsletter", "create_events",
      "edit_events", "manage_documents", "publish_documents", "view_payslips", "create_forms",
      "view_tickets", "reply_tickets", "manage_users", "approve_leaves", "approve_recovery",
      "view_expenses", "approve_expenses", "export_data", "view_stats", "full_admin", "add_gallery"].includes(p)
  );

  // Block users with neither admin nor communication rights nor granular perms
  if (me && !isAdmin && !isComm && !hasAnyMgmtPerm) {
    return (
      <div className="ms-card p-12 text-center" data-testid="mgmt-access-denied">
        <ShieldCheck className="mx-auto h-12 w-12 text-[#EF4444]" />
        <h2 className="mt-4 text-xl font-bold text-[#071B34]">Accès réservé aux administrateurs</h2>
        <p className="mt-2 text-sm text-[#475569]">
          Cet espace de gestion est uniquement accessible au Responsable Opérationnel.
        </p>
      </div>
    );
  }
  if (!me) return <div className="ms-card p-8 animate-pulse h-64" />;

  // Comm editor gets a restricted tab set (Communication only)
  const commSubNav = [
    { to: "/management/carrousel", label: "Carrousel accueil", icon: Newspaper },
    { to: "/management/agenda", label: "Agenda", icon: CalendarDays },
    { to: "/management/formulaires", label: "Formulaires", icon: FileText },
  ];
  const has = (...k) => isAdmin || (me?.permissions || []).includes("full_admin") || k.some((p) => (me?.permissions || []).includes(p));
  // Build a permission-aware sub-nav: admins see everything; comm editors see
  // the communication tabs; users with granular perms see just the ones they can use.
  const permAwareSubNav = isAdmin
    ? subNav
    : subNav.filter((s) => {
        const path = s.to.split("/").pop();
        if (path === "management" || s.end) return has("view_stats");
        if (path === "planning") return has("manage_users", "approve_leaves");
        if (path === "demandes") return has("approve_leaves", "approve_recovery");
        if (path === "attributions") return has("approve_leaves");
        if (path === "notes-de-frais") return has("view_expenses", "approve_expenses");
        if (path === "heures-supp") return has("approve_recovery");
        if (path === "restauration") return false;
        if (path === "carrousel") return has("manage_carousel");
        if (path === "agenda") return has("create_events", "edit_events");
        if (path === "formulaires") return has("create_forms");
        if (path === "utilisateurs") return has("manage_users");
        if (path === "fiches-de-paie") return has("view_payslips");
        if (path === "documents-editor") return has("manage_documents", "publish_documents");
        if (path === "idees") return false;
        if (path === "avantages") return false;
        if (path === "formations") return false;
        if (path === "support") return has("view_tickets", "reply_tickets");
        return false;
      });
  const tabs = isAdmin ? subNav : (isComm ? [...commSubNav, ...permAwareSubNav.filter((t) => !commSubNav.find((c) => c.to === t.to))] : permAwareSubNav);
  const headerAccent = isAdmin ? "#7C3AED" : isComm ? "#F59E0B" : "#0EA5E9";
  const headerBg = isAdmin
    ? "bg-[#A78BFA]/15 text-[#7C3AED]"
    : isComm
    ? "bg-[#F59E0B]/15 text-[#B45309]"
    : "bg-[#0EA5E9]/15 text-[#0369A1]";
  const headerOverline = isAdmin ? "Espace Management" : isComm ? "Espace Communication" : "Espace Management";
  const headerTitle = isAdmin
    ? "Pilotage opérationnel"
    : isComm
    ? "Gestion de la communication interne"
    : "Vos outils de gestion";

  return (
    <div className="space-y-5 ms-fade-up">
      <div className="flex items-center gap-3">
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${headerBg}`}>
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div>
          <div className="ms-overline" style={{ color: headerAccent }}>{headerOverline}</div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#071B34]">
            {headerTitle}
          </h1>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-xl bg-white border border-[#071B34]/8 p-1">
        {tabs.map((s) => (
          <NavLink
            key={s.to}
            to={s.to}
            end={s.end}
            data-testid={`mgmt-tab-${s.to.split("/").pop() || "overview"}`}
            className={({ isActive }) =>
              `inline-flex items-center gap-1.5 shrink-0 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
                isActive ? "bg-[#071B34] text-white shadow-md" : "text-[#475569] hover:bg-[#F4F7FA]"
              }`
            }
          >
            <s.icon className="h-3.5 w-3.5" />
            {s.label}
          </NavLink>
        ))}
      </div>

      <Routes>
        {(isAdmin || has("view_stats")) && <Route index element={<Overview />} />}
        {(isAdmin || has("manage_users", "approve_leaves")) && <Route path="planning" element={<PlanningManager />} />}
        {(isAdmin || has("approve_leaves", "approve_recovery")) && <Route path="demandes" element={<RequestsManager />} />}
        {(isAdmin || has("approve_leaves")) && <Route path="attributions" element={<LeaveGrantManager />} />}
        {(isAdmin || isComm || has("manage_carousel")) && <Route path="carrousel" element={<NewsManager />} />}
        {(isAdmin || isComm || has("create_events", "edit_events")) && <Route path="agenda" element={<AgendaManager />} />}
        {(isAdmin || isComm || has("create_forms")) && <Route path="formulaires" element={<FormBuilder />} />}
        {(isAdmin || has("manage_users")) && <Route path="utilisateurs" element={<UserManager />} />}
        <Route path="actualites" element={<Navigate to="/management/carrousel" replace />} />
        {(isAdmin || has("manage_documents")) && <Route path="documents" element={<DocumentsManager />} />}
        {(isAdmin || has("view_expenses", "approve_expenses")) && <Route path="notes-de-frais" element={<ExpensesManager />} />}
        {(isAdmin || has("approve_recovery")) && <Route path="heures-supp" element={<OvertimeManager />} />}
        {isAdmin && <Route path="formations" element={<FormationsManager />} />}
        {isAdmin && <Route path="restauration" element={<RestaurationManager />} />}
        {(isAdmin || has("view_payslips", "manage_documents")) && <Route path="fiches-de-paie" element={<PayslipsManager />} />}
        {isAdmin && <Route path="idees" element={<IdeasAdmin />} />}
        {isAdmin && <Route path="salles" element={<AdminSalles />} />}
        {isAdmin && <Route path="avantages" element={<PartnersManager />} />}
        {(isAdmin || has("view_tickets", "reply_tickets")) && <Route path="support" element={<SupportITList />} />}
        {(isAdmin || has("manage_documents", "publish_documents")) && <Route path="documents-editor" element={<HRDocsManager />} />}
        {(isAdmin || has("manage_documents", "publish_documents")) && <Route path="documents-editor/:id" element={<HRDocEditor />} />}
        <Route path="fil" element={<Navigate to="/actualites" replace />} />
        {/* Non-admin fallback: land on the first tab the user is actually allowed to see */}
        {!isAdmin && permAwareSubNav[0] && <Route index element={<Navigate to={permAwareSubNav[0].to} replace />} />}
        <Route path="*" element={<Navigate to={isAdmin ? "/management" : (permAwareSubNav[0]?.to || "/dashboard")} replace />} />
      </Routes>
    </div>
  );
}

// ───────────────────────────────────────── Vue d'ensemble

function Overview() {
  const [stats, setStats] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [pendingReqs, setPendingReqs] = useState([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.get("/admin/stats").then((r) => setStats(r.data)).catch(() => setError(true));
    api.get("/admin/employees").then((r) => setEmployees(r.data)).catch(() => {});
    api.get("/admin/requests?status=pending").then((r) => setPendingReqs(r.data)).catch(() => {});
  }, []);

  if (error) {
    return (
      <div className="ms-card p-8 text-center">
        <ShieldCheck className="mx-auto h-10 w-10 text-[#F59E0B]" />
        <h3 className="mt-3 text-lg font-bold text-[#071B34]">Statistiques indisponibles</h3>
        <p className="mt-1 text-sm text-[#475569]">
          Vous n&apos;avez pas la permission d&apos;accéder aux statistiques globales.
        </p>
      </div>
    );
  }
  if (!stats) return <div className="ms-card p-8 animate-pulse h-64" />;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={UsersIcon}
          label="Employés"
          value={stats.employees_count}
          accent="#3BA4FF"
          sub="actifs"
        />
        <StatCard
          icon={Clock}
          label="Heures planifiées"
          value={formatMinutes(stats.week_planned_minutes)}
          accent="#10B981"
          sub={`Contrat ${formatMinutes(stats.week_contract_minutes)}`}
        />
        <StatCard
          icon={Inbox}
          label="Demandes en attente"
          value={stats.pending_requests}
          accent="#F59E0B"
          sub="à traiter"
        />
        <StatCard
          icon={TrendingUp}
          label="Écart contrats"
          value={formatMinutes(Math.abs(stats.week_planned_minutes - stats.week_contract_minutes))}
          accent={stats.week_planned_minutes >= stats.week_contract_minutes ? "#10B981" : "#EF4444"}
          sub={stats.week_planned_minutes >= stats.week_contract_minutes ? "couvert" : "manquant"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="ms-card p-5">
          <h3 className="text-lg font-bold text-[#071B34] mb-3">Volumes horaires de la semaine</h3>
          <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
            {employees.map((e) => {
              const contract = (e.contract_hours_weekly || 35) * 60;
              const planned = e.week_planned_minutes || 0;
              const delta = planned - contract;
              const pct = contract > 0 ? Math.min(100, Math.round((planned / contract) * 100)) : 0;
              const color = delta === 0 ? "#10B981" : delta < 0 ? "#EF4444" : "#F59E0B";
              return (
                <div
                  key={e.id}
                  data-testid={`overview-emp-${e.id}`}
                  className="flex items-center gap-3 rounded-xl border border-[#071B34]/5 p-2.5"
                >
                  <img src={e.avatar} alt="" className="h-9 w-9 rounded-full object-cover shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-[#071B34] truncate">
                        {e.first_name} {e.last_name}
                      </div>
                      <div className="text-xs font-bold whitespace-nowrap" style={{ color }}>
                        {formatMinutes(planned)} / {e.contract_hours_weekly || 35}h
                      </div>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-[#F1F5F9] overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, pct)}%`,
                          background: color,
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="ms-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-[#071B34]">Demandes à traiter</h3>
            <NavLink
              to="/management/demandes"
              className="text-xs font-semibold text-[#3BA4FF] hover:underline inline-flex items-center gap-1"
            >
              Voir tout <ArrowRight className="h-3 w-3" />
            </NavLink>
          </div>
          {pendingReqs.length === 0 ? (
            <div className="text-sm text-[#475569] py-12 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-[#10B981]/40 mb-2" />
              Aucune demande en attente
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {pendingReqs.slice(0, 8).map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-3 rounded-xl border border-[#071B34]/5 p-2.5"
                >
                  {r.employee_avatar && (
                    <img src={r.employee_avatar} alt="" className="h-9 w-9 rounded-full object-cover shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-[#071B34] truncate">
                      {r.employee_name}
                    </div>
                    <div className="text-xs text-[#475569] truncate">
                      {r.type} · {r.start_date}
                      {r.end_date && r.end_date !== r.start_date ? ` → ${r.end_date}` : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, accent }) {
  return (
    <div className="ms-card ms-card-hover p-4">
      <div className="flex items-center justify-between">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ background: `${accent}1F`, color: accent }}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-3 text-2xl font-bold text-[#071B34]">{value}</div>
      <div className="ms-overline mt-1">{label}</div>
      <div className="text-xs text-[#475569] mt-0.5">{sub}</div>
    </div>
  );
}

// ───────────────────────────────────────── Planning manager (CORE)

function PlanningManager() {
  const [employees, setEmployees] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [weekStart, setWeekStart] = useState(mondayOf(new Date()));
  const [entries, setEntries] = useState([]);
  const [contract, setContract] = useState(null);
  const [editEntry, setEditEntry] = useState(null);
  const [weekEditorOpen, setWeekEditorOpen] = useState(false);

  useEffect(() => {
    api.get("/admin/employees").then((r) => {
      setEmployees(r.data);
      if (!selectedId && r.data.length > 0) setSelectedId(r.data[0].id);
    });
  }, []);

  const loadWeek = () => {
    if (!selectedId) return;
    api
      .get(`/admin/schedule/${selectedId}?week_start=${isoDate(weekStart)}`)
      .then((r) => setEntries(r.data));
    api
      .get(`/admin/contract-status/${selectedId}?week_start=${isoDate(weekStart)}`)
      .then((r) => setContract(r.data));
  };

  useEffect(() => { loadWeek(); }, [selectedId, weekStart]);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const entryFor = (day) => entries.find((e) => e.day === isoDate(day));

  const goPrev = () => setWeekStart(addDays(weekStart, -7));
  const goNext = () => setWeekStart(addDays(weekStart, 7));
  const goToday = () => setWeekStart(mondayOf(new Date()));

  const saveEntry = async (entry) => {
    try {
      await api.post("/admin/schedule", entry);
      toast.success("Planning enregistré");
      setEditEntry(null);
      loadWeek();
      notifyLiveRefresh(["schedule", "me"]);
    } catch (err) {
      toast.error("Erreur d'enregistrement", {
        description: err.response?.data?.detail || "Vérifiez les horaires",
      });
    }
  };

  const removeEntry = async (entry) => {
    if (!entry.id) return;
    if (!window.confirm("Supprimer cette entrée de planning ?")) return;
    try {
      await api.delete(`/admin/schedule/${entry.id}`);
      toast.success("Entrée supprimée");
      loadWeek();
      notifyLiveRefresh(["schedule", "me"]);
    } catch {
      toast.error("Suppression impossible");
    }
  };

  const selectedEmp = employees.find((e) => e.id === selectedId);
  const contractColor =
    contract?.status === "match"
      ? "#10B981"
      : contract?.status === "under"
      ? "#EF4444"
      : "#F59E0B";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      {/* Employee picker */}
      <aside className="lg:col-span-3 ms-card p-3 max-h-[80vh] overflow-y-auto">
        <h3 className="text-sm font-bold text-[#071B34] px-2 pt-2 pb-3">Employés</h3>
        <div className="space-y-1">
          {employees.map((e) => (
            <button
              key={e.id}
              data-testid={`pick-emp-${e.id}`}
              onClick={() => setSelectedId(e.id)}
              className={`w-full flex items-center gap-2.5 rounded-xl p-2 text-left transition-colors ${
                selectedId === e.id ? "bg-[#3BA4FF]/12" : "hover:bg-[#F4F7FA]"
              }`}
            >
              <img src={e.avatar} alt="" className="h-9 w-9 rounded-full object-cover shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-[#071B34] truncate">
                  {e.first_name} {e.last_name}
                </div>
                <div className="text-[11px] text-[#475569] truncate">
                  {e.contract_hours_weekly || 35}h · {e.role}
                </div>
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* Week editor */}
      <section className="lg:col-span-9 space-y-4">
        <div className="ms-card p-4 flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={goPrev}
              data-testid="prev-week"
              className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[#071B34]/5"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={goToday}
              data-testid="today-week"
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#F4F7FA] hover:bg-[#071B34]/5"
            >
              Aujourd'hui
            </button>
            <button
              onClick={goNext}
              data-testid="next-week"
              className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[#071B34]/5"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <div className="ml-3 text-sm font-bold text-[#071B34] capitalize">
              Semaine du {weekStart.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setWeekEditorOpen(true)}
              data-testid="week-editor-open"
              className="ms-btn-primary"
              disabled={!selectedId}
            >
              <CalendarClock className="h-3.5 w-3.5" /> Éditer la semaine complète
            </button>
            {contract && selectedEmp && (
            <div
              data-testid="contract-alert"
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold"
              style={{
                background: `${contractColor}1F`,
                color: contractColor,
              }}
            >
              {contract.status === "match" && <CheckCircle2 className="h-4 w-4" />}
              {contract.status === "under" && <AlertTriangle className="h-4 w-4" />}
              {contract.status === "over" && <TrendingUp className="h-4 w-4" />}
              <span>
                {selectedEmp.first_name} · {formatMinutes(contract.planned_minutes)} /{" "}
                {contract.contract_hours_weekly}h — {contract.message}
              </span>
            </div>
          )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
          {days.map((d, i) => {
            const ent = entryFor(d);
            const isToday = isoDate(d) === isoDate(new Date());
            return (
              <div
                key={i}
                data-testid={`day-${isoDate(d)}`}
                className={`ms-card p-3 min-h-[140px] flex flex-col ${
                  isToday ? "ring-2 ring-[#3BA4FF]/40" : ""
                }`}
              >
                <div className="text-[10px] uppercase tracking-wider font-bold text-[#475569]">
                  {fr.daysShort[i]}.
                </div>
                <div className="text-lg font-extrabold text-[#071B34] leading-none mt-0.5">
                  {d.getDate()}
                </div>
                <div className="text-[10px] text-[#475569] capitalize">
                  {fr.months[d.getMonth()].slice(0, 4)}.
                </div>
                <div className="mt-2 flex-1 flex flex-col">
                  {ent ? (
                    <EntryCard entry={ent} onEdit={() => setEditEntry({ ...ent })} onDelete={() => removeEntry(ent)} />
                  ) : (
                    <button
                      onClick={() =>
                        setEditEntry({
                          employee_id: selectedId,
                          day: isoDate(d),
                          type: "shift",
                          start: "10:00",
                          end: "18:00",
                          pause_start: "13:00",
                          pause_end: "13:45",
                          break_minutes: 45,
                          location: "MS Park",
                          service: selectedEmp?.department,
                          manager: "Marcus SIMÉO",
                          note: null,
                        })
                      }
                      data-testid={`add-day-${isoDate(d)}`}
                      className="mt-auto w-full text-[11px] font-semibold text-[#3BA4FF] hover:text-[#1D70B8] inline-flex items-center justify-center gap-1 rounded-lg border border-dashed border-[#3BA4FF]/40 hover:border-[#3BA4FF] py-2"
                    >
                      <Plus className="h-3 w-3" /> Ajouter
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {editEntry && (
        <EntryEditor
          entry={editEntry}
          employeeName={selectedEmp ? `${selectedEmp.first_name} ${selectedEmp.last_name}` : ""}
          onClose={() => setEditEntry(null)}
          onSave={saveEntry}
        />
      )}

      {weekEditorOpen && selectedEmp && (
        <WeekEditor
          employee={selectedEmp}
          weekStart={weekStart}
          existingEntries={entries}
          onClose={() => setWeekEditorOpen(false)}
          onSaved={() => {
            setWeekEditorOpen(false);
            loadWeek();
            notifyLiveRefresh(["schedule", "me"]);
          }}
        />
      )}
    </div>
  );
}

function EntryCard({ entry, onEdit, onDelete }) {
  const typeMeta = {
    shift: { color: "#3BA4FF", bg: "#3BA4FF1F", label: "Shift" },
    remote: { color: "#059669", bg: "#D1FAE5", label: "Télétravail" },
    off: { color: "#64748B", bg: "#F1F5F9", label: "OFF" },
    leave: { color: "#7C3AED", bg: "#A78BFA22", label: "Congé" },
    rtt: { color: "#1D70B8", bg: "#DBEAFE", label: "RTT" },
    training: { color: "#B45309", bg: "#FEF3C7", label: "Formation" },
  };
  const m = typeMeta[entry.type] || typeMeta.shift;
  return (
    <div className="flex-1 flex flex-col gap-1">
      <span
        className="ms-chip self-start"
        style={{ background: m.bg, color: m.color }}
      >
        {m.label}
      </span>
      {(entry.type === "shift" || entry.type === "remote") && (
        <div className="text-sm font-bold text-[#071B34] leading-tight">
          {entry.start}–{entry.end}
        </div>
      )}
      {(entry.type === "shift" || entry.type === "remote") && entry.pause_start && (
        <div className="text-[10px] text-[#475569]">
          pause {entry.pause_start}–{entry.pause_end}
        </div>
      )}
      {entry.type === "training" && entry.note && (
        <div className="text-[11px] text-[#B45309] font-semibold truncate">{entry.note}</div>
      )}
      <div className="mt-auto flex gap-1 pt-2">
        <button
          onClick={onEdit}
          data-testid="edit-entry"
          className="flex-1 text-[10px] font-semibold rounded-md bg-[#F4F7FA] hover:bg-[#3BA4FF]/10 hover:text-[#3BA4FF] py-1"
        >
          Modifier
        </button>
        <button
          onClick={onDelete}
          data-testid="delete-entry"
          className="text-[10px] font-semibold rounded-md bg-[#FEE2E2] hover:bg-[#EF4444]/20 text-[#EF4444] px-2 py-1"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────── Weekly bulk editor
const DAY_LABELS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

function WeekEditor({ employee, weekStart, existingEntries, onClose, onSaved }) {
  // Seed 7 rows from either existing entries or the employee's weekly_pattern
  const seedRows = () => {
    const pattern = employee.weekly_pattern || {};
    return Array.from({ length: 7 }, (_, i) => {
      const day = addDays(weekStart, i);
      const iso = isoDate(day);
      const existing = existingEntries.find((e) => e.day === iso);
      if (existing) {
        return {
          day_offset: i,
          type: existing.type || "shift",
          start: existing.start || "",
          end: existing.end || "",
          pause_start: existing.pause_start || "",
          pause_end: existing.pause_end || "",
          break_minutes: existing.break_minutes || 0,
          location: existing.location || "MS Park",
          service: existing.service || employee.department,
          note: existing.note || "",
          _locked_leave: existing.type === "leave" || existing.type === "rtt",
        };
      }
      const patt = pattern[String(i)] || { type: "off" };
      return {
        day_offset: i,
        type: patt.type || "off",
        start: patt.start || "",
        end: patt.end || "",
        pause_start: patt.pause_start || "",
        pause_end: patt.pause_end || "",
        break_minutes: patt.break_minutes || 0,
        location: "MS Park",
        service: employee.department,
        note: "",
        _locked_leave: false,
      };
    });
  };

  const [rows, setRows] = useState(seedRows);
  const [duplicate, setDuplicate] = useState(0);
  const [saving, setSaving] = useState(false);

  const updateRow = (i, patch) => {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };

  const totalMinutes = rows.reduce((sum, r) => {
    if (r.type !== "shift" || !r.start || !r.end) return sum;
    const [sh, sm] = r.start.split(":").map(Number);
    const [eh, em] = r.end.split(":").map(Number);
    let minutes = (eh * 60 + em) - (sh * 60 + sm);
    if (r.pause_start && r.pause_end) {
      const [psh, psm] = r.pause_start.split(":").map(Number);
      const [peh, pem] = r.pause_end.split(":").map(Number);
      minutes -= Math.max(0, (peh * 60 + pem) - (psh * 60 + psm));
    }
    return sum + Math.max(0, minutes);
  }, 0);
  const contractH = employee.contract_hours_weekly || 35;
  const diff = totalMinutes / 60 - contractH;

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        employee_id: employee.id,
        week_start: isoDate(weekStart),
        entries: rows
          .filter((r) => !r._locked_leave)
          .map(({ _locked_leave, ...rest }) => rest),
        duplicate_weeks: Number(duplicate) || 0,
      };
      const { data } = await api.post("/admin/schedule/week", payload);
      toast.success(
        `${data.days_saved} jour(s) enregistré(s) sur ${data.weeks_applied} semaine(s)`,
        { description: duplicate > 0 ? `Semaine dupliquée sur ${duplicate} semaine(s) suivante(s)` : undefined }
      );
      onSaved();
    } catch (err) {
      toast.error("Erreur d'enregistrement", { description: err.response?.data?.detail });
    } finally {
      setSaving(false);
    }
  };

  return (
    <PortalModal onClose={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        data-testid="week-editor"
        className="ms-card max-w-5xl w-full max-h-[92vh] overflow-y-auto"
      >
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-[#071B34]/5 p-5 flex items-start justify-between">
          <div>
            <div className="ms-overline">Éditeur semaine complète</div>
            <h3 className="text-xl font-bold text-[#071B34] mt-1">
              {employee.first_name} {employee.last_name} — Semaine du {weekStart.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
            </h3>
            <div className="mt-1 text-xs text-[#475569]">
              Contrat {contractH}h/sem · Modifiez tous les jours puis <strong>enregistrez d'un coup</strong>.
              Les jours <strong>OFF</strong> sont pré-remplis depuis le pattern hebdomadaire de l'employé.
            </div>
          </div>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[#071B34]/5">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-2">
          {rows.map((r, i) => {
            const day = addDays(weekStart, i);
            return (
              <WeekRow
                key={i}
                dayLabel={DAY_LABELS[i]}
                dayDate={day}
                row={r}
                onChange={(patch) => updateRow(i, patch)}
              />
            );
          })}
        </div>

        <div className="sticky bottom-0 z-10 bg-white/95 backdrop-blur border-t border-[#071B34]/5 p-5">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
            <div className="text-sm">
              <span className="text-[#475569]">Total planifié : </span>
              <strong className="text-[#071B34]">{Math.floor(totalMinutes / 60)}h{String(totalMinutes % 60).padStart(2, "0")}</strong>
              <span className="text-[#475569]"> · Contrat </span>
              <strong className="text-[#071B34]">{contractH}h</strong>
              {" "}
              <span
                className="ml-2 ms-chip"
                style={{
                  background: Math.abs(diff) < 0.1 ? "#D1FAE5" : diff < 0 ? "#FEE2E2" : "#FEF3C7",
                  color: Math.abs(diff) < 0.1 ? "#065F46" : diff < 0 ? "#B91C1C" : "#B45309",
                }}
              >
                {Math.abs(diff) < 0.1 ? "Conforme" : diff < 0 ? `-${Math.abs(diff).toFixed(1)}h` : `+${diff.toFixed(1)}h`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-[#475569]">Dupliquer sur</label>
              <select
                value={duplicate}
                onChange={(e) => setDuplicate(Number(e.target.value))}
                data-testid="week-duplicate-count"
                className="ms-input text-xs !py-1.5 !w-auto"
              >
                <option value={0}>Cette semaine seulement</option>
                <option value={1}>+ 1 semaine (soit 2)</option>
                <option value={2}>+ 2 semaines (soit 3)</option>
                <option value={3}>+ 3 semaines (~1 mois)</option>
                <option value={4}>+ 4 semaines</option>
                <option value={7}>+ 7 semaines (~2 mois)</option>
                <option value={11}>+ 11 semaines (~3 mois)</option>
              </select>
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={onClose} className="ms-btn-outline flex-1">Annuler</button>
            <button
              onClick={save}
              disabled={saving}
              data-testid="week-save"
              className="ms-btn-primary flex-1 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? "Enregistrement…" : duplicate > 0 ? `Enregistrer ${duplicate + 1} semaines` : "Enregistrer la semaine"}
            </button>
          </div>
        </div>
      </div>
    </PortalModal>
  );
}

const WEEK_TYPES = [
  { v: "shift", label: "Shift", color: "#3BA4FF", bg: "#3BA4FF1F" },
  { v: "remote", label: "Télétravail", color: "#059669", bg: "#D1FAE5" },
  { v: "off", label: "OFF", color: "#64748B", bg: "#F1F5F9" },
  { v: "training", label: "Formation", color: "#B45309", bg: "#FEF3C7" },
];

function WeekRow({ dayLabel, dayDate, row, onChange }) {
  const isLocked = row._locked_leave;
  const isShift = row.type === "shift" || row.type === "remote";
  const meta = WEEK_TYPES.find((t) => t.v === row.type) || WEEK_TYPES[0];
  return (
    <div
      className="grid grid-cols-12 items-center gap-2 rounded-xl border border-[#071B34]/5 p-3 hover:bg-[#F4F7FA]/40"
      data-testid={`week-row-${row.day_offset}`}
    >
      <div className="col-span-2">
        <div className="text-xs font-bold text-[#071B34]">{dayLabel}</div>
        <div className="text-[10px] text-[#475569]">
          {dayDate.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
        </div>
      </div>
      <div className="col-span-3 flex gap-1 flex-wrap">
        {isLocked ? (
          <span className="ms-chip bg-[#A78BFA]/15 text-[#7C3AED]">
            Congé validé (verrouillé)
          </span>
        ) : (
          WEEK_TYPES.map((t) => (
            <button
              key={t.v}
              type="button"
              onClick={() => onChange({ type: t.v })}
              className={`text-[10px] font-semibold rounded-md px-2 py-1 transition-colors ${
                row.type === t.v
                  ? "text-white"
                  : "hover:opacity-80"
              }`}
              style={{
                background: row.type === t.v ? t.color : t.bg,
                color: row.type === t.v ? "#fff" : t.color,
              }}
            >
              {t.label}
            </button>
          ))
        )}
      </div>
      {isShift && !isLocked ? (
        <>
          <input
            type="time"
            value={row.start}
            onChange={(e) => onChange({ start: e.target.value })}
            placeholder="Début"
            data-testid={`week-start-${row.day_offset}`}
            className="col-span-1 ms-input !py-1.5 !text-xs"
          />
          <input
            type="time"
            value={row.end}
            onChange={(e) => onChange({ end: e.target.value })}
            placeholder="Fin"
            data-testid={`week-end-${row.day_offset}`}
            className="col-span-1 ms-input !py-1.5 !text-xs"
          />
          <input
            type="time"
            value={row.pause_start}
            onChange={(e) => onChange({ pause_start: e.target.value })}
            placeholder="Pause"
            className="col-span-1 ms-input !py-1.5 !text-xs"
          />
          <input
            type="time"
            value={row.pause_end}
            onChange={(e) => onChange({ pause_end: e.target.value })}
            placeholder="Reprise"
            className="col-span-1 ms-input !py-1.5 !text-xs"
          />
          <input
            value={row.location}
            onChange={(e) => onChange({ location: e.target.value })}
            placeholder="Lieu"
            className="col-span-3 ms-input !py-1.5 !text-xs"
          />
        </>
      ) : (
        <div
          className="col-span-8 text-[11px] text-[#475569] italic"
          style={{ color: meta.color }}
        >
          {isLocked ? "Congé approuvé — ne sera pas écrasé lors de l'enregistrement." : `Journée ${meta.label.toLowerCase()} — aucun horaire`}
        </div>
      )}
    </div>
  );
}



function EntryEditor({ entry, employeeName, onClose, onSave }) {
  const [form, setForm] = useState(entry);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <PortalModal onClose={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="ms-card max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto"
        data-testid="entry-editor"
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="ms-overline">Planning</div>
            <h3 className="text-xl font-bold text-[#071B34] mt-1">{employeeName}</h3>
            <div className="text-xs text-[#475569] mt-0.5 capitalize">
              {new Date(form.day).toLocaleDateString("fr-FR", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </div>
          </div>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[#071B34]/5">
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="ms-overline">Type</label>
        <div className="grid grid-cols-5 gap-1.5 mt-2 mb-3">
          {[
            ["shift", "Shift"],
            ["remote", "Télétravail"],
            ["off", "OFF"],
            ["leave", "Congé"],
            ["training", "Formation"],
          ].map(([v, l]) => (
            <button
              key={v}
              data-testid={`type-${v}`}
              onClick={() => set("type", v)}
              className={`text-xs font-semibold rounded-lg py-2 transition-colors ${
                form.type === v
                  ? "bg-[#071B34] text-white"
                  : "bg-[#F4F7FA] text-[#475569] hover:bg-[#071B34]/5"
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        {(form.type === "shift" || form.type === "remote" || form.type === "training") && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="ms-overline">Début</label>
              <input
                type="time"
                value={form.start || ""}
                onChange={(e) => set("start", e.target.value)}
                data-testid="entry-start"
                className="ms-input mt-2"
              />
            </div>
            <div>
              <label className="ms-overline">Fin</label>
              <input
                type="time"
                value={form.end || ""}
                onChange={(e) => set("end", e.target.value)}
                data-testid="entry-end"
                className="ms-input mt-2"
              />
            </div>
          </div>
        )}

        {(form.type === "shift" || form.type === "remote") && (
          <div className="grid grid-cols-2 gap-2 mt-3">
            <div>
              <label className="ms-overline">Début pause</label>
              <input
                type="time"
                value={form.pause_start || ""}
                onChange={(e) => set("pause_start", e.target.value)}
                className="ms-input mt-2"
              />
            </div>
            <div>
              <label className="ms-overline">Fin pause</label>
              <input
                type="time"
                value={form.pause_end || ""}
                onChange={(e) => set("pause_end", e.target.value)}
                className="ms-input mt-2"
              />
            </div>
          </div>
        )}

        {(form.type === "shift" || form.type === "remote") && (
          <div className="mt-3">
            <label className="ms-overline">{form.type === "remote" ? "Lieu (télétravail)" : "Service / lieu"}</label>
            <input
              value={form.service || ""}
              onChange={(e) => set("service", e.target.value)}
              className="ms-input mt-2"
              placeholder={form.type === "remote" ? "Ex. Domicile" : "Ex. Karting, Soccer Bar…"}
            />
          </div>
        )}

        {(form.type === "training" || form.type === "leave") && (
          <div className="mt-3">
            <label className="ms-overline">Note</label>
            <input
              value={form.note || ""}
              onChange={(e) => set("note", e.target.value)}
              className="ms-input mt-2"
              placeholder="Précision…"
            />
          </div>
        )}

        <div className="mt-5 flex gap-2">
          <button onClick={onClose} className="ms-btn-outline flex-1">
            Annuler
          </button>
          <button
            onClick={() => onSave(form)}
            data-testid="save-entry"
            className="ms-btn-primary flex-1"
          >
            <Save className="h-4 w-4" /> Enregistrer
          </button>
        </div>
      </div>
    </PortalModal>
  );
}

// ───────────────────────────────────────── Demandes manager

function RequestsManager() {
  const { refreshMe, refreshEmployees } = useApp();
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("pending");
  const [infoModal, setInfoModal] = useState(null);
  const [note, setNote] = useState("");

  const load = () => {
    const q = filter === "all" ? "" : `?status=${filter}`;
    api.get(`/admin/requests${q}`).then((r) => setItems(r.data));
  };
  useEffect(() => { load(); }, [filter]);

  const decide = async (req, action) => {
    if (action === "info") {
      setInfoModal(req);
      return;
    }
    await api.post(`/admin/requests/${req.id}/${action}`, { note: null });
    toast.success(
      action === "approve" ? "Demande approuvée" : "Demande refusée",
      { description: `${req.employee_name} sera notifié·e` }
    );
    load();
    refreshMe?.();
    refreshEmployees?.();
    notifyLiveRefresh(["requests", "schedule", "me", "notifications"]);
  };

  const submitInfo = async () => {
    if (!infoModal || !note.trim()) return;
    await api.post(`/admin/requests/${infoModal.id}/info`, { note: note.trim() });
    toast.success("Demande de complément envoyée");
    setInfoModal(null);
    setNote("");
    load();
  };

  return (
    <div className="space-y-4">
      <div className="ms-card p-3 flex gap-1.5">
        {[
          ["pending", "En attente"],
          ["approved", "Approuvées"],
          ["rejected", "Refusées"],
          ["info_requested", "Compléments"],
          ["all", "Toutes"],
        ].map(([v, l]) => (
          <button
            key={v}
            onClick={() => setFilter(v)}
            data-testid={`filter-${v}`}
            className={`text-xs font-semibold rounded-lg px-3 py-2 transition-colors ${
              filter === v
                ? "bg-[#071B34] text-white shadow-md"
                : "text-[#475569] hover:bg-[#F4F7FA]"
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="ms-card p-12 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-[#10B981]/40" />
          <h3 className="mt-3 text-base font-bold text-[#071B34]">Aucune demande</h3>
          <p className="mt-1 text-sm text-[#475569]">Tout est à jour ✨</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((r) => (
            <RequestRow key={r.id} req={r} onDecide={decide} />
          ))}
        </div>
      )}

      {infoModal && (
        <PortalModal onClose={() => setInfoModal(null)}>
          <div onClick={(e) => e.stopPropagation()} className="ms-card max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-[#071B34]">Demande de complément</h3>
            <p className="text-sm text-[#475569] mt-1">À {infoModal.employee_name}</p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              data-testid="info-note"
              placeholder="Que souhaitez-vous demander ?"
              className="ms-input mt-3 resize-none"
            />
            <div className="mt-4 flex gap-2">
              <button onClick={() => setInfoModal(null)} className="ms-btn-outline flex-1">
                Annuler
              </button>
              <button
                onClick={submitInfo}
                disabled={!note.trim()}
                data-testid="submit-info"
                className="ms-btn-primary flex-1 disabled:opacity-40"
              >
                <MessageCircle className="h-4 w-4" /> Envoyer
              </button>
            </div>
          </div>
        </PortalModal>
      )}
    </div>
  );
}

function RequestRow({ req, onDecide }) {
  const typeLabel = {
    cp: "Congé payé",
    conge: "Congé payé",
    rtt: "RTT",
    absence: "Absence",
    echange: "Échange horaires",
    acompte: "Acompte",
    materiel: "Matériel",
    maladie: "Arrêt maladie",
    sick: "Arrêt maladie",
    badge_lost: "Badge perdu",
    other: "Demande",
  }[req.type] || req.type;
  const statusBadge = {
    pending: { label: "En attente", color: "#F59E0B", bg: "#FEF3C7" },
    approved: { label: "Approuvée", color: "#10B981", bg: "#D1FAE5" },
    rejected: { label: "Refusée", color: "#EF4444", bg: "#FEE2E2" },
    info_requested: { label: "Info demandée", color: "#3BA4FF", bg: "#E0F2FE" },
  }[req.status] || { label: req.status, color: "#475569", bg: "#F1F5F9" };

  return (
    <div className="ms-card p-4" data-testid={`req-${req.id}`}>
      <div className="flex items-start gap-3">
        {req.employee_avatar && (
          <img src={req.employee_avatar} alt="" className="h-11 w-11 rounded-full object-cover shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-bold text-[#071B34]">{req.employee_name}</div>
            <span className="ms-chip bg-[#F4F7FA] text-[#475569]">{typeLabel}</span>
            <span className="ms-chip" style={{ background: statusBadge.bg, color: statusBadge.color }}>
              {statusBadge.label}
            </span>
          </div>
          <div className="text-xs text-[#475569] mt-1">
            {req.start_date}
            {req.end_date && req.end_date !== req.start_date ? ` → ${req.end_date}` : ""}
            {req.amount && ` · ${req.amount}`}
          </div>
          {req.comment && (
            <div className="mt-2 text-sm text-[#071B34] bg-[#F4F7FA] rounded-lg px-3 py-2">
              {req.comment}
            </div>
          )}
          {req.decision_note && (
            <div className="mt-2 text-xs text-[#3BA4FF] italic">Note : {req.decision_note}</div>
          )}
        </div>
      </div>
      {req.status === "pending" && (
        <div className="mt-3 flex flex-wrap gap-2 justify-end">
          <button
            onClick={() => onDecide(req, "info")}
            data-testid={`info-${req.id}`}
            className="ms-btn-outline !text-xs !py-2"
          >
            <MessageCircle className="h-3.5 w-3.5" /> Info
          </button>
          <button
            onClick={() => onDecide(req, "reject")}
            data-testid={`reject-${req.id}`}
            className="ms-btn-outline !text-xs !py-2 !text-[#EF4444] !border-[#EF4444]/30 hover:!bg-[#FEE2E2]"
          >
            <X className="h-3.5 w-3.5" /> Refuser
          </button>
          <button
            onClick={() => onDecide(req, "approve")}
            data-testid={`approve-${req.id}`}
            className="ms-btn-primary !text-xs !py-2 !bg-[#10B981] hover:!bg-[#059669]"
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Approuver
          </button>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────── News manager

function NewsManager() {
  const [form, setForm] = useState({
    title: "", content: "", category: "info",
    pinned: false, featured: false, active: true, order: 100,
    image: "", cta_text: "En savoir plus", cta_url: "",
    target_type: "news", target_id: "",
    audience_status_targets: [],
  });
  const [news, setNews] = useState([]);
  const [posts, setPosts] = useState([]);
  const [events, setEvents] = useState([]);
  const [editing, setEditing] = useState(null);
  const load = () => {
    api.get("/news").then((r) => setNews(r.data));
    api.get("/posts").then((r) => setPosts(r.data));
    api.get("/events").then((r) => setEvents(r.data));
  };
  useEffect(() => { load(); }, []);

  // Merge news + posts into a single title-searchable list — the redirection
  // page (`/actualites/:id`) auto-resolves either kind by ID.
  const actualiteChoices = useMemo(() => {
    const asChoice = (o, kind) => ({
      id: o.id,
      title: o.title || "(sans titre)",
      kind,
      date: (o.date || o.created_at || "").slice(0, 10),
    });
    const list = [
      ...news.map((n) => asChoice(n, "news")),
      ...posts.map((p) => asChoice(p, "post")),
    ];
    return list.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [news, posts]);

  const publish = async () => {
    if (!form.title.trim() || !form.content.trim()) return;
    try {
      await api.post("/admin/news", form);
      toast.success("Actualité publiée");
      setForm({
        title: "", content: "", category: "info",
        pinned: false, featured: false, active: true, order: 100,
        image: "", cta_text: "En savoir plus", cta_url: "",
        target_type: "news", target_id: "",
        audience_status_targets: [],
      });
      load();
      notifyLiveRefresh(["news", "carousel"]);
    } catch {
      toast.error("Impossible de publier");
    }
  };

  const toggleField = async (n, field) => {
    try {
      await api.put(`/admin/news/${n.id}`, { [field]: !n[field] });
      toast.success("Actualité mise à jour");
      load();
      notifyLiveRefresh(["news", "carousel"]);
    } catch {
      toast.error("Erreur");
    }
  };

  const move = async (n, delta) => {
    try {
      await api.put(`/admin/news/${n.id}`, { order: (n.order || 100) + delta });
      load();
      notifyLiveRefresh(["news", "carousel"]);
    } catch {
      toast.error("Erreur");
    }
  };

  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const onDragStart = (id) => setDragId(id);
  const onDragOver = (e, id) => {
    e.preventDefault();
    if (id !== dragOverId) setDragOverId(id);
  };
  const onDragEnd = () => { setDragId(null); setDragOverId(null); };
  const onDrop = async (e, targetId) => {
    e.preventDefault();
    const sourceId = dragId;
    onDragEnd();
    if (!sourceId || sourceId === targetId) return;
    // Compute new order from currently-sorted list
    const sorted = news.slice().sort((a, b) => (a.order || 100) - (b.order || 100));
    const from = sorted.findIndex((n) => n.id === sourceId);
    const to = sorted.findIndex((n) => n.id === targetId);
    if (from === -1 || to === -1) return;
    const reordered = [...sorted];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    const ids = reordered.map((n) => n.id);
    // Optimistic UI: apply new orders locally right away
    setNews((prev) => prev.map((n) => {
      const i = ids.indexOf(n.id);
      return i >= 0 ? { ...n, order: (i + 1) * 10 } : n;
    }));
    try {
      await api.post("/admin/news/reorder", { ids });
      toast.success("Ordre mis à jour");
      notifyLiveRefresh(["news", "carousel"]);
      load();
    } catch {
      toast.error("Erreur");
      load();
    }
  };

  const remove = async (n) => {
    if (!window.confirm(`Supprimer "${n.title}" ?`)) return;
    try {
      await api.delete(`/admin/news/${n.id}`);
      toast.success("Actualité supprimée");
      load();
      notifyLiveRefresh(["news", "carousel"]);
    } catch {
      toast.error("Erreur");
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
      <div className="lg:col-span-2 ms-card p-5">
        <h3 className="text-lg font-bold text-[#071B34] mb-1">Ajouter une slide au carrousel</h3>
        <p className="text-xs text-[#475569] mb-3">
          Ces slides sont affichées sur la page d'accueil des employés (Dashboard).
          Pour publier une actualité dans le fil MS Park, utilisez <strong>Entreprise → Actualités</strong>.
        </p>
        <div className="space-y-3">
          <div>
            <label className="ms-overline">Titre</label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              data-testid="news-title"
              placeholder="Ex. Nouvelle attraction à venir"
              className="ms-input mt-2"
            />
          </div>
          <div>
            <label className="ms-overline">Catégorie</label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="ms-input mt-2"
            >
              <option value="info">Info</option>
              <option value="rh">RH</option>
              <option value="securite">Sécurité</option>
              <option value="evenement">Événement</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div>
            <label className="ms-overline">Image</label>
            <div className="mt-2">
              <ImageUpload
                value={form.image}
                onChange={(v) => setForm({ ...form, image: v })}
                testId="news-image"
              />
            </div>
          </div>
          <div>
            <label className="ms-overline">Contenu</label>
            <textarea
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              data-testid="news-content"
              rows={5}
              placeholder="Détails de l'annonce…"
              className="ms-input mt-2 resize-none"
            />
          </div>
          <div>
            <label className="ms-overline">Texte du bouton</label>
            <input
              value={form.cta_text}
              onChange={(e) => setForm({ ...form, cta_text: e.target.value })}
              placeholder="En savoir plus"
              className="ms-input mt-2"
            />
          </div>
          <TargetPicker
            value={{ target_type: form.target_type, target_id: form.target_id, cta_url: form.cta_url }}
            onChange={(v) => setForm({ ...form, ...v })}
            news={actualiteChoices}
            events={events}
          />
          <div className="grid grid-cols-3 gap-2 pt-2">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={form.pinned}
                onChange={(e) => setForm({ ...form, pinned: e.target.checked })}
                className="h-4 w-4 accent-[#3BA4FF]"
              />
              Épinglée
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={form.featured}
                onChange={(e) => setForm({ ...form, featured: e.target.checked })}
                data-testid="news-featured"
                className="h-4 w-4 accent-[#F59E0B]"
              />
              Carrousel accueil
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                className="h-4 w-4 accent-[#10B981]"
              />
              Active
            </label>
          </div>
          <div className="pt-2">
            <AudiencePicker
              value={form.audience_status_targets || []}
              onChange={(v) => setForm({ ...form, audience_status_targets: v })}
            />
          </div>
          <button
            onClick={publish}
            data-testid="publish-news"
            disabled={!form.title.trim() || !form.content.trim()}
            className="ms-btn-primary w-full disabled:opacity-40"
          >
            <Newspaper className="h-4 w-4" /> Publier
          </button>
        </div>
      </div>

      <div className="lg:col-span-3 ms-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold text-[#071B34]">Actualités &amp; carrousel</h3>
          <span className="text-[10px] text-[#475569] uppercase tracking-wider">
            {news.filter((n) => n.featured).length} en carrousel · {news.length} total · Glisser pour réordonner
          </span>
        </div>
        <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
          {news
            .slice()
            .sort((a, b) => (a.order || 100) - (b.order || 100))
            .map((n) => (
              <div
                key={n.id}
                draggable
                onDragStart={() => onDragStart(n.id)}
                onDragOver={(e) => onDragOver(e, n.id)}
                onDrop={(e) => onDrop(e, n.id)}
                onDragEnd={onDragEnd}
                data-testid={`slide-row-${n.id}`}
                className={`rounded-xl border p-3 flex gap-2 items-start transition-all cursor-grab active:cursor-grabbing ${
                  dragOverId === n.id && dragId !== n.id
                    ? "ring-2 ring-[#3BA4FF] border-[#3BA4FF] bg-[#3BA4FF]/5"
                    : dragId === n.id
                    ? "opacity-40"
                    : n.featured
                    ? "border-[#F59E0B]/40 bg-[#FEF3C7]/30"
                    : "border-[#071B34]/5"
                }`}
              >
                <div className="flex items-center h-14 text-[#94A3B8]" title="Glisser pour réordonner">
                  <GripVertical className="h-4 w-4" />
                </div>
                {n.image && (
                  <img src={absoluteUrl(n.image)} alt="" className="h-14 w-20 rounded-lg object-cover shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <div className="font-semibold text-sm text-[#071B34] line-clamp-1">{n.title}</div>
                    {n.pinned && <span className="text-[10px]">📌</span>}
                    {n.featured && <span className="ms-chip bg-[#FEF3C7] text-[#B45309]">Carrousel</span>}
                    {!n.active && <span className="ms-chip bg-[#F1F5F9] text-[#475569]">Inactive</span>}
                  </div>
                  <div className="text-xs text-[#475569] line-clamp-2 mt-0.5">{n.content}</div>
                  <div className="text-[10px] text-[#475569]/70 mt-1">
                    Ordre : {n.order ?? 100} ·{" "}
                    {new Date(n.date).toLocaleString("fr-FR", {
                      day: "numeric", month: "short",
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </div>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <div className="flex gap-1">
                    <button
                      onClick={() => move(n, -10)}
                      title="Monter"
                      className="flex h-7 w-7 items-center justify-center rounded-md bg-[#F4F7FA] hover:bg-[#071B34]/5"
                    >
                      <ChevronLeft className="h-3 w-3 rotate-90" />
                    </button>
                    <button
                      onClick={() => move(n, 10)}
                      title="Descendre"
                      className="flex h-7 w-7 items-center justify-center rounded-md bg-[#F4F7FA] hover:bg-[#071B34]/5"
                    >
                      <ChevronRight className="h-3 w-3 rotate-90" />
                    </button>
                  </div>
                  <button
                    onClick={() => setEditing(n)}
                    data-testid={`edit-slide-${n.id}`}
                    className="text-[10px] font-bold rounded-md px-2 py-1 bg-[#3BA4FF]/12 text-[#1D70B8] hover:bg-[#3BA4FF]/25"
                  >
                    Modifier
                  </button>
                  <button
                    onClick={() => toggleField(n, "featured")}
                    data-testid={`toggle-featured-${n.id}`}
                    className={`text-[10px] font-bold rounded-md px-2 py-1 ${
                      n.featured
                        ? "bg-[#F59E0B] text-white"
                        : "bg-[#F4F7FA] text-[#475569] hover:bg-[#F59E0B]/20 hover:text-[#B45309]"
                    }`}
                  >
                    {n.featured ? "★ Carrousel" : "☆ Carrousel"}
                  </button>
                  <button
                    onClick={() => toggleField(n, "active")}
                    className={`text-[10px] font-bold rounded-md px-2 py-1 ${
                      n.active === false
                        ? "bg-[#F1F5F9] text-[#475569]"
                        : "bg-[#10B981]/15 text-[#059669]"
                    }`}
                  >
                    {n.active === false ? "○ Inactive" : "● Active"}
                  </button>
                  <button
                    onClick={() => remove(n)}
                    className="text-[10px] font-semibold rounded-md bg-[#FEE2E2] text-[#EF4444] hover:bg-[#EF4444]/20 px-2 py-1"
                  >
                    <Trash2 className="h-3 w-3 inline" />
                  </button>
                </div>
              </div>
            ))}
        </div>
      </div>

      {editing && (
        <SlideEditor
          slide={editing}
          news={actualiteChoices}
          events={events}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}


function TargetPicker({ value, onChange, news, events }) {
  const type = value.target_type || "news";
  const [search, setSearch] = useState("");
  const filtered = news
    .filter((n) => n.title?.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 100);
  return (
    <div>
      <label className="ms-overline">Destination du bouton</label>
      <div className="grid grid-cols-5 gap-1 mt-2">
        {[
          ["news", "Actualité"],
          ["event", "Événement"],
          ["internal", "Page interne"],
          ["external", "Lien externe"],
          ["document", "Document"],
        ].map(([v, l]) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange({ target_type: v, target_id: "", cta_url: "" })}
            data-testid={`target-${v}`}
            className={`text-[10px] font-semibold rounded-lg py-1.5 transition-colors ${
              type === v
                ? "bg-[#071B34] text-white"
                : "bg-[#F4F7FA] text-[#475569] hover:bg-[#071B34]/5"
            }`}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="mt-2 space-y-2">
        {type === "news" && (
          <>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 Rechercher une actualité par titre…"
              className="ms-input"
            />
            <select
              value={value.target_id || ""}
              onChange={(e) => onChange({ target_id: e.target.value })}
              data-testid="target-news-select"
              className="ms-input"
              size={Math.min(6, Math.max(3, filtered.length + 1))}
            >
              <option value="">— Choisir une actualité —</option>
              {filtered.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.title}
                  {n.kind === "post" ? " · Fil" : n.kind === "news" ? " · Carrousel" : ""}
                  {n.date ? ` — ${n.date}` : ""}
                </option>
              ))}
            </select>
            {value.target_id && (
              <div className="text-[10px] text-[#475569] px-2">
                ID enregistré : <code className="text-[#3BA4FF]">{value.target_id}</code> —
                la redirection ira toujours vers cette actualité même si son titre change.
              </div>
            )}
          </>
        )}
        {type === "event" && (
          <select
            value={value.target_id || ""}
            onChange={(e) => onChange({ target_id: e.target.value })}
            data-testid="target-event-select"
            className="ms-input"
          >
            <option value="">— Choisir un événement —</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title} — {e.date}
              </option>
            ))}
          </select>
        )}
        {type === "internal" && (
          <input
            value={value.cta_url || ""}
            onChange={(e) => onChange({ cta_url: e.target.value })}
            placeholder="Ex. /restaurant ou /rh/planning"
            className="ms-input"
          />
        )}
        {type === "external" && (
          <input
            value={value.cta_url || ""}
            onChange={(e) => onChange({ cta_url: e.target.value })}
            placeholder="https://exemple.com"
            className="ms-input"
          />
        )}
        {type === "document" && (
          <input
            value={value.cta_url || ""}
            onChange={(e) => onChange({ cta_url: e.target.value })}
            placeholder="URL du document (PDF, docx…)"
            className="ms-input"
          />
        )}
      </div>
    </div>
  );
}


function SlideEditor({ slide, news, events, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: slide.title || "",
    content: slide.content || "",
    image: slide.image || "",
    category: slide.category || "info",
    cta_text: slide.cta_text || "En savoir plus",
    cta_url: slide.cta_url || "",
    target_type: slide.target_type || (slide.cta_url?.startsWith("http") ? "external" : "internal"),
    target_id: slide.target_id || "",
    featured: slide.featured ?? false,
    active: slide.active ?? true,
    pinned: slide.pinned ?? false,
    order: slide.order ?? 100,
  });
  const save = async () => {
    try {
      await api.put(`/admin/news/${slide.id}`, form);
      toast.success("Slide mise à jour");
      notifyLiveRefresh(["news", "carousel"]);
      onSaved();
    } catch (err) {
      toast.error("Erreur de sauvegarde", { description: err.response?.data?.detail });
    }
  };
  return (
    <PortalModal onClose={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="ms-card max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto"
        data-testid="slide-editor"
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="ms-overline">Modifier la slide</div>
            <h3 className="text-xl font-bold text-[#071B34] mt-1">{slide.title}</h3>
          </div>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[#071B34]/5">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="ms-overline">Titre</label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="ms-input mt-2"
            />
          </div>
          <div>
            <label className="ms-overline">Image</label>
            <div className="mt-2">
              <ImageUpload
                value={form.image}
                onChange={(v) => setForm({ ...form, image: v })}
                testId="slide-image"
              />
            </div>
          </div>
          <div>
            <label className="ms-overline">Contenu</label>
            <textarea
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              rows={4}
              className="ms-input mt-2 resize-none"
            />
          </div>
          <div>
            <label className="ms-overline">Texte du bouton</label>
            <input
              value={form.cta_text}
              onChange={(e) => setForm({ ...form, cta_text: e.target.value })}
              className="ms-input mt-2"
            />
          </div>
          <TargetPicker
            value={{ target_type: form.target_type, target_id: form.target_id, cta_url: form.cta_url }}
            onChange={(v) => setForm({ ...form, ...v })}
            news={news}
            events={events}
          />
          <div>
            <label className="ms-overline">Ordre d'affichage</label>
            <input
              type="number"
              value={form.order}
              onChange={(e) => setForm({ ...form, order: Number(e.target.value) })}
              className="ms-input mt-2"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} className="h-4 w-4 accent-[#3BA4FF]" />
              Épinglée
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={form.featured} onChange={(e) => setForm({ ...form, featured: e.target.checked })} className="h-4 w-4 accent-[#F59E0B]" />
              Carrousel
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="h-4 w-4 accent-[#10B981]" />
              Active
            </label>
          </div>
          <div className="flex gap-2 pt-3">
            <button onClick={onClose} className="ms-btn-outline flex-1">Annuler</button>
            <button onClick={save} data-testid="save-slide" className="ms-btn-primary flex-1">
              <Save className="h-4 w-4" /> Enregistrer
            </button>
          </div>
        </div>
      </div>
    </PortalModal>
  );
}

// ───────────────────────────────────────── RTT / CP allocation (bonus)

function LeaveGrantManager() {
  const { refreshMe } = useApp();
  const [employees, setEmployees] = useState([]);
  const [selected, setSelected] = useState([]);
  const [type, setType] = useState("rtt");
  const [days, setDays] = useState(1);
  const [accruing, setAccruing] = useState(false);

  useEffect(() => {
    api.get("/admin/employees").then((r) => setEmployees(r.data));
  }, []);

  const reload = () => {
    api.get("/admin/employees").then((r) => setEmployees(r.data));
    refreshMe?.();
  };

  const toggle = (id) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const grant = async () => {
    if (!selected.length || days <= 0) return;
    try {
      await api.post("/admin/leave/grant", {
        employee_ids: selected,
        days: Number(days),
        type,
      });
      toast.success(`${days} jour(s) ${type.toUpperCase()} attribué(s) à ${selected.length} employé(s)`);
      setSelected([]);
      setDays(1);
      reload();
      notifyLiveRefresh(["me", "notifications"]);
    } catch {
      toast.error("Erreur d'attribution");
    }
  };

  const accrueMonthly = async () => {
    setAccruing(true);
    try {
      const { data } = await api.post("/admin/leave/accrue-monthly");
      toast.success(`+2,5 jours CP crédités à ${data.accrued_count} employé(s) (mois ${data.month})`);
      reload();
      notifyLiveRefresh(["me", "notifications"]);
    } catch {
      toast.error("Erreur d'acquisition mensuelle");
    } finally {
      setAccruing(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
      <div className="lg:col-span-2 ms-card p-5">
        <h3 className="text-lg font-bold text-[#071B34] mb-3">Attribuer RTT ou CP</h3>
        <div className="space-y-3">
          <div>
            <label className="ms-overline">Type</label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {[
                ["rtt", "RTT"],
                ["cp", "Congés payés"],
              ].map(([v, l]) => (
                <button
                  key={v}
                  onClick={() => setType(v)}
                  data-testid={`grant-type-${v}`}
                  className={`text-xs font-semibold rounded-lg py-2 transition-colors ${
                    type === v
                      ? "bg-[#071B34] text-white"
                      : "bg-[#F4F7FA] text-[#475569] hover:bg-[#071B34]/5"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="ms-overline">Nombre de jours</label>
            <input
              type="number"
              step="0.5"
              min="0.5"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              data-testid="grant-days"
              className="ms-input mt-2"
            />
          </div>
          <div className="text-xs text-[#475569]">
            {selected.length} employé{selected.length > 1 ? "s" : ""} sélectionné{selected.length > 1 ? "s" : ""}
          </div>
          <button
            onClick={grant}
            data-testid="grant-btn"
            disabled={!selected.length || days <= 0}
            className="ms-btn-primary w-full disabled:opacity-40"
          >
            <Gift className="h-4 w-4" /> Attribuer
          </button>

          <div className="border-t border-[#071B34]/5 pt-3 mt-4">
            <div className="text-xs text-[#475569] mb-2">
              <strong>Acquisition mensuelle automatique :</strong> +2,5 jours de CP à chaque
              employé le 1<sup>er</sup> du mois.
            </div>
            <button
              onClick={accrueMonthly}
              disabled={accruing}
              data-testid="accrue-monthly"
              className="ms-btn-outline w-full disabled:opacity-40"
            >
              <Sparkles className="h-4 w-4" />
              {accruing ? "Traitement…" : "Simuler +2,5 CP (ce mois)"}
            </button>
          </div>
        </div>
      </div>

      <div className="lg:col-span-3 ms-card p-5">
        <h3 className="text-lg font-bold text-[#071B34] mb-3">Compteurs par employé</h3>
        <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
          {employees.map((e) => {
            const bal = e.leave_balance || {};
            const checked = selected.includes(e.id);
            return (
              <button
                key={e.id}
                onClick={() => toggle(e.id)}
                data-testid={`grant-pick-${e.id}`}
                className={`flex items-center gap-3 w-full rounded-xl p-2.5 text-left transition-colors ${
                  checked ? "bg-[#3BA4FF]/12 ring-1 ring-[#3BA4FF]/40" : "hover:bg-[#F4F7FA]"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  readOnly
                  className="h-4 w-4 accent-[#3BA4FF] shrink-0"
                />
                <img src={e.avatar} alt="" className="h-9 w-9 rounded-full object-cover shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-[#071B34] truncate">
                    {e.first_name} {e.last_name}
                  </div>
                  <div className="text-[11px] text-[#475569] truncate">{e.role}</div>
                </div>
                <div className="flex gap-1.5 shrink-0 text-[11px]">
                  <span className="ms-chip bg-[#3BA4FF]/12 text-[#1D70B8]">
                    CP N-1 {bal.cp_n_1 || 0}
                  </span>
                  <span className="ms-chip bg-[#10B981]/12 text-[#059669]">
                    CP {bal.cp_n || 0}
                  </span>
                  <span className="ms-chip bg-[#A78BFA]/12 text-[#7C3AED]">
                    RTT {bal.rtt || 0}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}


// ───────────────────────────────────────── Documents RH manager

function DocumentsManager() {
  const [employees, setEmployees] = useState([]);
  const [docs, setDocs] = useState([]);
  const [form, setForm] = useState({
    name: "",
    category: "Contrats",
    url: "",
    target_employee_id: "all",
    description: "",
    size_kb: 100,
  });
  const [payslipForm, setPayslipForm] = useState({
    employee_id: "",
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
  });

  const loadDocs = () => api.get("/documents").then((r) => setDocs(r.data));
  useEffect(() => {
    api.get("/admin/employees").then((r) => {
      setEmployees(r.data);
      if (r.data[0]) setPayslipForm((p) => ({ ...p, employee_id: r.data[0].id }));
    });
    loadDocs();
  }, []);

  const submit = async () => {
    if (!form.name.trim() || !form.category) return;
    try {
      await api.post("/admin/documents", {
        ...form,
        target_employee_id: form.target_employee_id === "all" ? null : form.target_employee_id,
      });
      toast.success("Document publié");
      setForm({ name: "", category: "Contrats", url: "", target_employee_id: "all", description: "", size_kb: 100 });
      loadDocs();
      notifyLiveRefresh(["documents", "notifications"]);
    } catch {
      toast.error("Erreur de publication");
    }
  };

  const genPayslip = async () => {
    if (!payslipForm.employee_id) return;
    try {
      await api.post("/admin/documents/payslip", payslipForm);
      toast.success("Fiche de paie générée");
      loadDocs();
      notifyLiveRefresh(["documents", "notifications"]);
    } catch (err) {
      toast.error("Erreur de génération", { description: err.response?.data?.detail });
    }
  };

  const remove = async (d) => {
    if (!window.confirm(`Supprimer "${d.name}" ?`)) return;
    try {
      await api.delete(`/admin/documents/${d.id}`);
      toast.success("Document supprimé");
      loadDocs();
      notifyLiveRefresh(["documents"]);
    } catch {
      toast.error("Erreur");
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
      <div className="lg:col-span-2 space-y-4">
        <div className="ms-card p-5">
          <h3 className="text-lg font-bold text-[#071B34] mb-3">Ajouter un document</h3>
          <div className="space-y-3">
            <div>
              <label className="ms-overline">Titre</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                data-testid="doc-name"
                placeholder="Ex. Avenant contrat mars 2026"
                className="ms-input mt-2"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="ms-overline">Catégorie</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="ms-input mt-2"
                >
                  {["Paie", "Contrats", "Règlements", "Sécurité", "Planning", "Attestations", "Autre"].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="ms-overline">Destinataire</label>
                <select
                  value={form.target_employee_id}
                  onChange={(e) => setForm({ ...form, target_employee_id: e.target.value })}
                  data-testid="doc-target"
                  className="ms-input mt-2"
                >
                  <option value="all">Tous les employés</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.first_name} {e.last_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="ms-overline">URL du fichier</label>
              <input
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                data-testid="doc-url"
                placeholder="https://exemple.com/fichier.pdf"
                className="ms-input mt-2"
              />
            </div>
            <div>
              <label className="ms-overline">Description (facultatif)</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
                className="ms-input mt-2 resize-none"
              />
            </div>
            <button
              onClick={submit}
              data-testid="publish-doc"
              disabled={!form.name.trim()}
              className="ms-btn-primary w-full disabled:opacity-40"
            >
              <FileText className="h-4 w-4" /> Publier
            </button>
          </div>
        </div>

        <div className="ms-card p-5">
          <h3 className="text-lg font-bold text-[#071B34] mb-1 flex items-center gap-2">
            <Receipt className="h-5 w-5 text-[#3BA4FF]" /> Générer une fiche de paie
          </h3>
          <p className="text-xs text-[#475569] mb-3">
            Bulletin de salaire réaliste conforme au modèle simplifié français.
          </p>
          <div className="space-y-3">
            <div>
              <label className="ms-overline">Employé</label>
              <select
                value={payslipForm.employee_id}
                onChange={(e) => setPayslipForm({ ...payslipForm, employee_id: e.target.value })}
                data-testid="payslip-emp"
                className="ms-input mt-2"
              >
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.first_name} {e.last_name} ({e.contract_hours_weekly || 35}h/sem)
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="ms-overline">Année</label>
                <input
                  type="number"
                  min="2020" max="2100"
                  value={payslipForm.year}
                  onChange={(e) => setPayslipForm({ ...payslipForm, year: Number(e.target.value) })}
                  className="ms-input mt-2"
                />
              </div>
              <div>
                <label className="ms-overline">Mois</label>
                <select
                  value={payslipForm.month}
                  onChange={(e) => setPayslipForm({ ...payslipForm, month: Number(e.target.value) })}
                  className="ms-input mt-2"
                >
                  {["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"].map((m, i) => (
                    <option key={m} value={i + 1}>{m}</option>
                  ))}
                </select>
              </div>
            </div>
            <button
              onClick={genPayslip}
              data-testid="gen-payslip"
              className="ms-btn-primary w-full"
            >
              <Receipt className="h-4 w-4" /> Générer et envoyer
            </button>
          </div>
        </div>
      </div>

      <div className="lg:col-span-3 ms-card p-5">
        <h3 className="text-lg font-bold text-[#071B34] mb-3">Documents publiés ({docs.length})</h3>
        <div className="space-y-2 max-h-[720px] overflow-y-auto pr-1">
          {docs.map((d) => (
            <div key={d.id} className="rounded-xl border border-[#071B34]/5 p-3 flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#3BA4FF]/12 text-[#3BA4FF] shrink-0">
                {d.is_payslip ? <Receipt className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-semibold text-sm text-[#071B34] line-clamp-1">{d.name}</div>
                  <span className="ms-chip bg-[#F4F7FA] text-[#475569]">{d.category}</span>
                  {d.target_employee_id === "all" && (
                    <span className="ms-chip bg-[#10B981]/12 text-[#059669]">Tous</span>
                  )}
                </div>
                {d.description && (
                  <div className="text-xs text-[#475569] mt-0.5 line-clamp-2">{d.description}</div>
                )}
                <div className="text-[10px] text-[#475569]/70 mt-1">
                  {d.issued_at} · {d.size_kb} Ko
                </div>
              </div>
              <button
                onClick={() => remove(d)}
                className="shrink-0 text-[10px] font-semibold rounded-md bg-[#FEE2E2] text-[#EF4444] hover:bg-[#EF4444]/20 px-2 py-1"
              >
                <Trash2 className="h-3 w-3 inline" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────── Agenda Manager (Admin)

const EVENT_CATEGORIES = [
  { v: "event", label: "Événement", bg: "#A78BFA22", color: "#7C3AED" },
  { v: "training", label: "Formation", bg: "#FEF3C7", color: "#B45309" },
  { v: "meeting", label: "Réunion", bg: "#3BA4FF22", color: "#1D70B8" },
  { v: "birthday", label: "Anniversaire", bg: "#FCE7F3", color: "#BE185D" },
  { v: "maintenance", label: "Maintenance", bg: "#F1F5F9", color: "#475569" },
];

const GROUP_OPTIONS = [
  { v: "all", label: "Tous les employés" },
  { v: "admin", label: "Admins" },
  { v: "managers", label: "Managers / Encadrement" },
  { v: "ops", label: "Opérations" },
  { v: "restauration", label: "Restauration" },
];


function FormPickerOrUrl({ value, onChange }) {
  const [forms, setForms] = useState([]);
  useEffect(() => {
    api.get("/admin/forms").then((r) => setForms(r.data)).catch(() => setForms([]));
  }, []);
  const formsById = useMemo(() => Object.fromEntries(forms.map((f) => [`/formulaires/${f.id}`, f])), [forms]);
  const isFormUrl = value?.startsWith("/formulaires/");
  return (
    <div className="space-y-2">
      {forms.length > 0 && (
        <select
          value={isFormUrl ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          data-testid="event-cta-form-select"
          className="ms-input"
        >
          <option value="">— Choisir un formulaire créé —</option>
          {forms.map((f) => (
            <option key={f.id} value={`/formulaires/${f.id}`}>
              {f.title}
              {!f.active ? " (désactivé)" : ""}
            </option>
          ))}
        </select>
      )}
      <input
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="…ou coller une URL (billetterie, mailto:…, https://…)"
        className="ms-input"
      />
      {isFormUrl && formsById[value] && (
        <div className="text-[10px] text-[#475569] px-2">
          → Ouvre le formulaire <strong>{formsById[value].title}</strong>.
        </div>
      )}
    </div>
  );
}


function AgendaManager() {
  const [events, setEvents] = useState([]);
  const [news, setNews] = useState([]);
  const [posts, setPosts] = useState([]);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = () => {
    api.get("/admin/events").then((r) => setEvents(r.data)).catch(() => setEvents([]));
    api.get("/news").then((r) => setNews(r.data)).catch(() => setNews([]));
    api.get("/posts").then((r) => setPosts(r.data)).catch(() => setPosts([]));
  };
  useEffect(() => { load(); }, []);

  // Same merge as NewsManager — pickers show news + posts by title
  const actualiteChoices = useMemo(() => {
    const list = [
      ...news.map((n) => ({ id: n.id, title: n.title || "(sans titre)", kind: "news", date: (n.date || "").slice(0, 10) })),
      ...posts.map((p) => ({ id: p.id, title: p.title || "(sans titre)", kind: "post", date: (p.created_at || "").slice(0, 10) })),
    ];
    return list.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [news, posts]);

  const remove = async (ev) => {
    if (!window.confirm(`Supprimer l'événement "${ev.title}" ?`)) return;
    try {
      await api.delete(`/admin/events/${ev.id}`);
      toast.success("Événement supprimé");
      load();
      notifyLiveRefresh(["events", "notifications"]);
    } catch {
      toast.error("Impossible de supprimer");
    }
  };

  const upcoming = events.filter((e) => e.date >= new Date().toISOString().slice(0, 10));
  const past = events.filter((e) => e.date < new Date().toISOString().slice(0, 10));

  return (
    <div className="space-y-5">
      <div className="ms-card p-5 flex items-center justify-between">
        <div>
          <div className="ms-overline">Agenda</div>
          <h3 className="text-lg font-bold text-[#071B34] mt-1">Événements & temps forts du parc</h3>
          <p className="text-xs text-[#475569] mt-1">
            Créez, ciblez et publiez les événements visibles sur l'Agenda des employés.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          data-testid="agenda-create"
          className="ms-btn-primary"
        >
          <Plus className="h-4 w-4" /> Nouvel événement
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="ms-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-bold text-[#071B34]">À venir</h4>
            <span className="text-[10px] uppercase tracking-wider text-[#475569]">
              {upcoming.length} événement{upcoming.length > 1 ? "s" : ""}
            </span>
          </div>
          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {upcoming.length === 0 && (
              <div className="text-center py-8 text-sm text-[#475569]">Aucun événement planifié.</div>
            )}
            {upcoming.map((e) => (
              <EventRow key={e.id} ev={e} onEdit={() => setEditing(e)} onDelete={() => remove(e)} />
            ))}
          </div>
        </div>

        <div className="ms-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-bold text-[#071B34]">Passés</h4>
            <span className="text-[10px] uppercase tracking-wider text-[#475569]">
              {past.length} archivé{past.length > 1 ? "s" : ""}
            </span>
          </div>
          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1 opacity-70">
            {past.length === 0 && (
              <div className="text-center py-8 text-sm text-[#475569]">Aucun événement passé.</div>
            )}
            {past.map((e) => (
              <EventRow key={e.id} ev={e} onEdit={() => setEditing(e)} onDelete={() => remove(e)} />
            ))}
          </div>
        </div>
      </div>

      {(editing || creating) && (
        <EventEditor
          event={editing}
          news={actualiteChoices}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={() => { setEditing(null); setCreating(false); load(); }}
        />
      )}
    </div>
  );
}

function EventRow({ ev, onEdit, onDelete }) {
  const cat = EVENT_CATEGORIES.find((c) => c.v === (ev.category || ev.type)) || EVENT_CATEGORIES[0];
  const groups = ev.group_targets || ["all"];
  return (
    <div className="rounded-xl border border-[#071B34]/5 p-3 flex gap-3 items-start" data-testid={`event-row-${ev.id}`}>
      <div
        className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl"
        style={{ background: cat.bg, color: cat.color }}
      >
        <CalendarDays className="h-3.5 w-3.5" />
        <div className="text-[10px] font-bold mt-0.5">
          {new Date(ev.date).getDate()}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-semibold text-sm text-[#071B34] line-clamp-1">{ev.title}</span>
          <span className="ms-chip" style={{ background: cat.bg, color: cat.color }}>
            {cat.label}
          </span>
        </div>
        <div className="text-[11px] text-[#475569] mt-0.5">
          <Clock className="inline h-3 w-3 mr-1" />
          {(ev.start_time || ev.time) || "—"}
          {ev.location ? ` · ${ev.location}` : ""}
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {groups.map((g) => {
            const meta = GROUP_OPTIONS.find((x) => x.v === g);
            return (
              <span
                key={g}
                className="text-[9px] uppercase tracking-wider font-semibold rounded-md bg-[#F4F7FA] text-[#475569] px-1.5 py-0.5"
              >
                {meta ? meta.label : g}
              </span>
            );
          })}
          {(ev.employee_targets || []).length > 0 && (
            <span className="text-[9px] uppercase tracking-wider font-semibold rounded-md bg-[#3BA4FF]/12 text-[#1D70B8] px-1.5 py-0.5">
              +{ev.employee_targets.length} pers.
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1 shrink-0">
        <button
          onClick={onEdit}
          data-testid={`event-edit-${ev.id}`}
          className="text-[10px] font-bold rounded-md px-2 py-1 bg-[#3BA4FF]/12 text-[#1D70B8] hover:bg-[#3BA4FF]/25"
        >
          Modifier
        </button>
        <button
          onClick={onDelete}
          data-testid={`event-delete-${ev.id}`}
          className="text-[10px] font-semibold rounded-md bg-[#FEE2E2] text-[#EF4444] hover:bg-[#EF4444]/20 px-2 py-1"
        >
          <Trash2 className="h-3 w-3 inline" />
        </button>
      </div>
    </div>
  );
}

function EventEditor({ event, news, onClose, onSaved }) {
  const isNew = !event;
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    title: event?.title || "",
    description: event?.description || "",
    intro_text: event?.intro_text || "",
    date: event?.date || today,
    end_date: event?.end_date || "",
    start_time: event?.start_time || event?.time || "09:00",
    end_time: event?.end_time || "",
    location: event?.location || "",
    image: event?.image || "",
    category: event?.category || event?.type || "event",
    signup_enabled: event?.signup_enabled ?? event?.needs_registration ?? false,
    signup_url: event?.signup_url || "",
    linked_news_id: event?.linked_news_id || "",
    external_link: event?.external_link || "",
    // ─── Unified CTA button
    cta_enabled: event?.cta_enabled ?? (event?.signup_enabled || !!event?.linked_news_id || !!event?.external_link) ?? false,
    cta_text: event?.cta_text || "",
    cta_target_type: event?.cta_target_type
      || (event?.linked_news_id ? "news" : event?.external_link ? "external" : event?.signup_url ? "signup" : "news"),
    cta_target_id: event?.cta_target_id || event?.linked_news_id || "",
    cta_url: event?.cta_url || event?.external_link || event?.signup_url || "",
    group_targets: event?.group_targets || ["all"],
    employee_targets: event?.employee_targets || [],
    audience_status_targets: event?.audience_status_targets || [],
  });

  const [employees, setEmployees] = useState([]);
  useEffect(() => {
    api.get("/employees").then((r) => setEmployees(r.data)).catch(() => setEmployees([]));
  }, []);

  const toggleGroup = (g) => {
    setForm((f) => {
      const has = f.group_targets.includes(g);
      let next;
      if (g === "all") {
        next = has ? [] : ["all"];
      } else {
        next = has ? f.group_targets.filter((x) => x !== g) : [...f.group_targets.filter((x) => x !== "all"), g];
      }
      if (next.length === 0) next = ["all"];
      return { ...f, group_targets: next };
    });
  };

  const toggleEmployee = (id) => {
    setForm((f) => ({
      ...f,
      employee_targets: f.employee_targets.includes(id)
        ? f.employee_targets.filter((x) => x !== id)
        : [...f.employee_targets, id],
    }));
  };

  const save = async () => {
    if (!form.title.trim() || !form.date) {
      toast.error("Titre et date requis");
      return;
    }
    try {
      if (isNew) {
        await api.post("/admin/events", form);
        toast.success("Événement créé");
      } else {
        await api.put(`/admin/events/${event.id}`, form);
        toast.success("Événement mis à jour");
      }
      notifyLiveRefresh(["events", "notifications"]);
      onSaved();
    } catch (err) {
      toast.error("Erreur", { description: err.response?.data?.detail });
    }
  };

  return (
    <PortalModal onClose={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="ms-card max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto"
        data-testid="event-editor"
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="ms-overline">{isNew ? "Nouvel événement" : "Modifier l'événement"}</div>
            <h3 className="text-xl font-bold text-[#071B34] mt-1">
              {isNew ? "Créer un événement" : event.title}
            </h3>
          </div>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[#071B34]/5">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="ms-overline">Titre</label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              data-testid="event-title"
              placeholder="Ex. Tournoi Karting Inter-équipes"
              className="ms-input mt-2"
            />
          </div>

          <div>
            <label className="ms-overline">Catégorie</label>
            <div className="grid grid-cols-5 gap-1 mt-2">
              {EVENT_CATEGORIES.map((c) => (
                <button
                  key={c.v}
                  type="button"
                  onClick={() => setForm({ ...form, category: c.v })}
                  className={`text-[10px] font-semibold rounded-lg py-1.5 transition-colors ${
                    form.category === c.v ? "text-white" : "text-[#475569] hover:opacity-80"
                  }`}
                  style={{
                    background: form.category === c.v ? c.color : c.bg,
                    color: form.category === c.v ? "#fff" : c.color,
                  }}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="ms-overline">Date de début</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                data-testid="event-date"
                className="ms-input mt-2"
              />
            </div>
            <div>
              <label className="ms-overline">Date de fin (optionnel)</label>
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                data-testid="event-end-date"
                min={form.date}
                className="ms-input mt-2"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="ms-overline">Début</label>
              <input
                type="time"
                value={form.start_time}
                onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                data-testid="event-start"
                className="ms-input mt-2"
              />
            </div>
            <div>
              <label className="ms-overline">Fin (optionnel)</label>
              <input
                type="time"
                value={form.end_time}
                onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                className="ms-input mt-2"
              />
            </div>
          </div>

          <div>
            <label className="ms-overline">Sous-titre / accroche</label>
            <input
              value={form.intro_text}
              onChange={(e) => setForm({ ...form, intro_text: e.target.value })}
              placeholder="Ex. Un moment de partage entre équipes"
              className="ms-input mt-2"
            />
          </div>

          <div>
            <label className="ms-overline">Lieu</label>
            <input
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="Ex. Salle Atlas"
              className="ms-input mt-2"
            />
          </div>

          <div>
            <label className="ms-overline">Image de l'événement</label>
            <div className="mt-2">
              <ImageUpload
                value={form.image}
                onChange={(v) => setForm({ ...form, image: v })}
                testId="event-image"
              />
            </div>
          </div>

          <div>
            <label className="ms-overline">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={4}
              placeholder="Détails de l'événement…"
              className="ms-input mt-2 resize-none"
            />
          </div>

          <div>
            <label className="ms-overline">Groupes cibles</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
              {GROUP_OPTIONS.map((g) => {
                const active = form.group_targets.includes(g.v);
                return (
                  <button
                    key={g.v}
                    type="button"
                    onClick={() => toggleGroup(g.v)}
                    data-testid={`event-group-${g.v}`}
                    className={`text-[11px] font-semibold rounded-lg py-2 px-2 transition-colors ${
                      active
                        ? "bg-[#071B34] text-white"
                        : "bg-[#F4F7FA] text-[#475569] hover:bg-[#071B34]/5"
                    }`}
                  >
                    {g.label}
                  </button>
                );
              })}
            </div>
          </div>

          <details className="rounded-xl bg-[#F4F7FA] p-3">
            <summary className="cursor-pointer text-xs font-semibold text-[#475569] flex items-center gap-1.5">
              <UsersIcon className="h-3.5 w-3.5" />
              Cibler des employés spécifiques ({form.employee_targets.length})
            </summary>
            <div className="mt-3 max-h-40 overflow-y-auto space-y-1">
              {employees.map((emp) => (
                <label
                  key={emp.id}
                  className="flex items-center gap-2 text-xs py-1 px-2 rounded hover:bg-white cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={form.employee_targets.includes(emp.id)}
                    onChange={() => toggleEmployee(emp.id)}
                    className="h-3.5 w-3.5 accent-[#3BA4FF]"
                  />
                  {emp.first_name} {emp.last_name} — <span className="text-[#475569]">{emp.role}</span>
                </label>
              ))}
            </div>
          </details>

          {/* ───────── Unified action button configurator ───────── */}
          <div className="rounded-xl border border-[#071B34]/5 p-3 space-y-3">
            <label className="flex items-center justify-between gap-2 text-sm font-semibold text-[#071B34]">
              <span className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-[#3BA4FF]" />
                Bouton d'action sur l'événement
              </span>
              <input
                type="checkbox"
                checked={form.cta_enabled}
                onChange={(e) => setForm({ ...form, cta_enabled: e.target.checked })}
                data-testid="event-cta-toggle"
                className="h-4 w-4 accent-[#3BA4FF]"
              />
            </label>

            {form.cta_enabled && (
              <>
                <div>
                  <label className="ms-overline">Texte du bouton</label>
                  <input
                    value={form.cta_text}
                    onChange={(e) => setForm({ ...form, cta_text: e.target.value })}
                    placeholder="Ex. Réserver, En savoir plus, Voir le programme…"
                    data-testid="event-cta-text"
                    maxLength={40}
                    className="ms-input mt-2"
                  />
                  <div className="mt-1 flex flex-wrap gap-1">
                    {["Réserver", "En savoir plus", "Acheter un billet", "Découvrir", "Voir l'actualité", "Voir le programme", "Accéder au site", "Répondre", "Nous contacter"].map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setForm({ ...form, cta_text: t })}
                        className="text-[10px] rounded-md px-2 py-1 bg-[#F4F7FA] hover:bg-[#071B34]/8 text-[#475569] font-semibold"
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="ms-overline">Destination du bouton</label>
                  <div className="grid grid-cols-4 gap-1 mt-2">
                    {[
                      ["news", "Actualité"],
                      ["external", "Lien externe"],
                      ["internal", "Page interne"],
                      ["signup", "Formulaire"],
                    ].map(([v, l]) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setForm({ ...form, cta_target_type: v, cta_target_id: "", cta_url: "" })}
                        data-testid={`event-cta-target-${v}`}
                        className={`text-[10px] font-semibold rounded-lg py-1.5 transition-colors ${
                          form.cta_target_type === v
                            ? "bg-[#071B34] text-white"
                            : "bg-[#F4F7FA] text-[#475569] hover:bg-[#071B34]/5"
                        }`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>

                  <div className="mt-2">
                    {form.cta_target_type === "news" && (
                      <>
                        <select
                          value={form.cta_target_id}
                          onChange={(e) => setForm({ ...form, cta_target_id: e.target.value })}
                          data-testid="event-cta-news-select"
                          className="ms-input"
                        >
                          <option value="">— Choisir une actualité —</option>
                          {news.map((n) => (
                            <option key={n.id} value={n.id}>
                              {n.title}
                              {n.kind === "post" ? " · Fil" : n.kind === "news" ? " · Carrousel" : ""}
                            </option>
                          ))}
                        </select>
                        {form.cta_target_id && (
                          <div className="mt-1 text-[10px] text-[#475569]">
                            ID enregistré : <code className="text-[#3BA4FF]">{form.cta_target_id}</code> — la
                            redirection restera valide même si le titre change.
                          </div>
                        )}
                      </>
                    )}
                    {form.cta_target_type === "external" && (
                      <input
                        value={form.cta_url}
                        onChange={(e) => setForm({ ...form, cta_url: e.target.value })}
                        placeholder="https://…"
                        data-testid="event-cta-external-url"
                        className="ms-input"
                      />
                    )}
                    {form.cta_target_type === "internal" && (
                      <input
                        value={form.cta_url}
                        onChange={(e) => setForm({ ...form, cta_url: e.target.value })}
                        placeholder="Ex. /agenda ou /rh/planning"
                        className="ms-input"
                      />
                    )}
                    {form.cta_target_type === "signup" && (
                      <FormPickerOrUrl
                        value={form.cta_url}
                        onChange={(v) => setForm({ ...form, cta_url: v })}
                      />
                    )}
                  </div>
                </div>

                {/* Live preview of the final button */}
                <div className="rounded-lg bg-[#F8FAFC] p-3">
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-[#475569] mb-2">
                    Aperçu du bouton
                  </div>
                  <div
                    className="ms-btn-primary inline-flex select-none pointer-events-none"
                    data-testid="event-cta-preview"
                  >
                    {form.cta_text || "En savoir plus"}
                  </div>
                </div>
              </>
            )}
            {!form.cta_enabled && (
              <div className="text-[11px] text-[#475569] italic">
                Aucun bouton ne sera affiché sur la fiche de l'événement.
              </div>
            )}
          </div>

          <div className="pt-2">
            <AudiencePicker
              value={form.audience_status_targets || []}
              onChange={(v) => setForm({ ...form, audience_status_targets: v })}
            />
          </div>

          <div className="flex gap-2 pt-3">
            <button onClick={onClose} className="ms-btn-outline flex-1">Annuler</button>
            <button onClick={save} data-testid="event-save" className="ms-btn-primary flex-1">
              <Save className="h-4 w-4" />
              {isNew ? "Créer l'événement" : "Enregistrer"}
            </button>
          </div>
        </div>
      </div>
    </PortalModal>
  );
}





// ───────────────────────────────────────── Fil MS Park (broadcast admin)

function BroadcastManager() {
  const [content, setContent] = useState("");
  const [channels, setChannels] = useState([]);
  const [messages, setMessages] = useState([]);
  const [channelId, setChannelId] = useState("ch-accueil");
  const scrollRef = useRef(null);

  useEffect(() => {
    api.get("/channels").then((r) =>
      setChannels(r.data.filter((c) => !c.is_dm && !c.archived))
    );
  }, []);

  const loadMessages = () => {
    api.get(`/channels/${channelId}/messages`).then((r) => {
      setMessages(r.data);
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      });
    });
  };
  useEffect(loadMessages, [channelId]);

  const send = async () => {
    if (!content.trim()) return;
    try {
      await api.post("/admin/broadcast", { content: content.trim(), channel_id: channelId });
      toast.success("Message publié sur le fil");
      setContent("");
      loadMessages();
      notifyLiveRefresh(["messages", "notifications"]);
    } catch {
      toast.error("Erreur d'envoi");
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="ms-card p-5 lg:col-span-1">
        <h3 className="text-lg font-bold text-[#071B34] mb-3 flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-[#3BA4FF]" />
          Publier sur le fil
        </h3>
        <p className="text-xs text-[#475569] mb-3">
          Diffusez un message officiel dans un canal MS Park — visible par tous les membres.
        </p>
        <div className="space-y-3">
          <div>
            <label className="ms-overline">Canal cible</label>
            <select
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              data-testid="broadcast-channel"
              className="ms-input mt-2"
            >
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="ms-overline">Message</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              data-testid="broadcast-content"
              rows={6}
              placeholder="Bonjour à tous — rappel important…"
              className="ms-input mt-2 resize-none"
            />
          </div>
          <button
            onClick={send}
            data-testid="broadcast-send"
            disabled={!content.trim()}
            className="ms-btn-primary w-full disabled:opacity-40"
          >
            <Send className="h-4 w-4" /> Publier
          </button>
        </div>
      </div>

      <div className="lg:col-span-2 ms-card p-0 flex flex-col overflow-hidden max-h-[720px]">
        <div className="px-5 py-3 border-b border-[#071B34]/5 shrink-0">
          <h3 className="text-sm font-bold text-[#071B34]">Aperçu — #{channels.find(c => c.id === channelId)?.name || channelId}</h3>
        </div>
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0 bg-[#F8FAFC]">
          {messages.length === 0 && (
            <div className="text-center text-sm text-[#475569] py-12">Pas encore de message.</div>
          )}
          {messages.map((m) => (
            <div key={m.id} className="rounded-2xl bg-white border border-[#071B34]/5 px-4 py-3 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-[#071B34]">
                  {m.is_admin_broadcast && "📣 "}
                  {m.author_id === "emp-marcus-simeo" ? "Marcus SIMÉO" : m.author_id}
                </span>
                <span className="text-[10px] text-[#475569]">
                  {new Date(m.ts).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
                {m.is_admin_broadcast && (
                  <span className="ms-chip bg-[#3BA4FF]/12 text-[#1D70B8]">Annonce officielle</span>
                )}
              </div>
              <div className="text-sm text-[#071B34] whitespace-pre-wrap break-words">{m.content}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
