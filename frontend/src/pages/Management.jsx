import { useEffect, useMemo, useState } from "react";
import { NavLink, Route, Routes, Navigate } from "react-router-dom";
import {
  BarChart3, ClipboardList, Inbox, Newspaper, ShieldCheck, ArrowRight,
  Users as UsersIcon, AlertTriangle, CheckCircle2, TrendingUp, ChevronLeft, ChevronRight,
  Plus, Trash2, Save, X, CalendarDays, Clock, MessageCircle, Gift, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { api, fr, formatMinutes } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";

const subNav = [
  { to: "/management", label: "Vue d'ensemble", icon: BarChart3, end: true },
  { to: "/management/planning", label: "Plannings", icon: ClipboardList },
  { to: "/management/demandes", label: "Demandes", icon: Inbox },
  { to: "/management/attributions", label: "Attributions RTT/CP", icon: Gift },
  { to: "/management/actualites", label: "Actualités", icon: Newspaper },
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

  // Block non-admin
  if (me && !me.is_admin) {
    return (
      <div className="ms-card p-12 text-center">
        <ShieldCheck className="mx-auto h-12 w-12 text-[#EF4444]" />
        <h2 className="mt-4 text-xl font-bold text-[#071B34]">Accès réservé aux administrateurs</h2>
        <p className="mt-2 text-sm text-[#475569]">
          Cet espace de gestion est uniquement accessible au Responsable Opérationnel.
        </p>
      </div>
    );
  }
  if (!me) return <div className="ms-card p-8 animate-pulse h-64" />;

  return (
    <div className="space-y-5 ms-fade-up">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#A78BFA]/15 text-[#7C3AED]">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div>
          <div className="ms-overline text-[#7C3AED]">Espace Management</div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#071B34]">
            Pilotage opérationnel
          </h1>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-xl bg-white border border-[#071B34]/8 p-1">
        {subNav.map((s) => (
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
        <Route index element={<Overview />} />
        <Route path="planning" element={<PlanningManager />} />
        <Route path="demandes" element={<RequestsManager />} />
        <Route path="attributions" element={<LeaveGrantManager />} />
        <Route path="actualites" element={<NewsManager />} />
        <Route path="*" element={<Navigate to="/management" replace />} />
      </Routes>
    </div>
  );
}

// ───────────────────────────────────────── Vue d'ensemble

function Overview() {
  const [stats, setStats] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [pendingReqs, setPendingReqs] = useState([]);

  useEffect(() => {
    api.get("/admin/stats").then((r) => setStats(r.data));
    api.get("/admin/employees").then((r) => setEmployees(r.data));
    api.get("/admin/requests?status=pending").then((r) => setPendingReqs(r.data));
  }, []);

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
    </div>
  );
}

function EntryCard({ entry, onEdit, onDelete }) {
  const typeMeta = {
    shift: { color: "#3BA4FF", bg: "#3BA4FF1F", label: "Shift" },
    off: { color: "#64748B", bg: "#F1F5F9", label: "OFF" },
    leave: { color: "#7C3AED", bg: "#A78BFA22", label: "Congé" },
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
      {entry.type === "shift" && (
        <div className="text-sm font-bold text-[#071B34] leading-tight">
          {entry.start}–{entry.end}
        </div>
      )}
      {entry.type === "shift" && entry.pause_start && (
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

function EntryEditor({ entry, employeeName, onClose, onSave }) {
  const [form, setForm] = useState(entry);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-center justify-center p-4"
    >
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
        <div className="grid grid-cols-4 gap-1.5 mt-2 mb-3">
          {[
            ["shift", "Shift"],
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

        {(form.type === "shift" || form.type === "training") && (
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

        {form.type === "shift" && (
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

        {form.type === "shift" && (
          <div className="mt-3">
            <label className="ms-overline">Service / lieu</label>
            <input
              value={form.service || ""}
              onChange={(e) => set("service", e.target.value)}
              className="ms-input mt-2"
              placeholder="Ex. Karting, Soccer Bar…"
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
    </div>
  );
}

// ───────────────────────────────────────── Demandes manager

function RequestsManager() {
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
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setInfoModal(null)}
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-center justify-center p-4"
        >
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
        </div>
      )}
    </div>
  );
}

function RequestRow({ req, onDecide }) {
  const typeLabel = {
    cp: "Congé payé",
    rtt: "RTT",
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
    image: "", cta_text: "", cta_url: "",
  });
  const [news, setNews] = useState([]);
  const load = () => api.get("/news").then((r) => setNews(r.data));
  useEffect(() => { load(); }, []);

  const publish = async () => {
    if (!form.title.trim() || !form.content.trim()) return;
    try {
      await api.post("/admin/news", form);
      toast.success("Actualité publiée");
      setForm({
        title: "", content: "", category: "info",
        pinned: false, featured: false, active: true, order: 100,
        image: "", cta_text: "", cta_url: "",
      });
      load();
    } catch {
      toast.error("Impossible de publier");
    }
  };

  const toggleField = async (n, field) => {
    try {
      await api.put(`/admin/news/${n.id}`, { [field]: !n[field] });
      toast.success("Actualité mise à jour");
      load();
    } catch {
      toast.error("Erreur");
    }
  };

  const move = async (n, delta) => {
    try {
      await api.put(`/admin/news/${n.id}`, { order: (n.order || 100) + delta });
      load();
    } catch {
      toast.error("Erreur");
    }
  };

  const remove = async (n) => {
    if (!window.confirm(`Supprimer "${n.title}" ?`)) return;
    try {
      await api.delete(`/admin/news/${n.id}`);
      toast.success("Actualité supprimée");
      load();
    } catch {
      toast.error("Erreur");
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
      <div className="lg:col-span-2 ms-card p-5">
        <h3 className="text-lg font-bold text-[#071B34] mb-3">Publier une actualité</h3>
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
            <label className="ms-overline">Image (URL)</label>
            <input
              value={form.image}
              onChange={(e) => setForm({ ...form, image: e.target.value })}
              data-testid="news-image"
              placeholder="https://…"
              className="ms-input mt-2"
            />
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
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="ms-overline">Texte bouton</label>
              <input
                value={form.cta_text}
                onChange={(e) => setForm({ ...form, cta_text: e.target.value })}
                placeholder="En savoir plus"
                className="ms-input mt-2"
              />
            </div>
            <div>
              <label className="ms-overline">Lien bouton</label>
              <input
                value={form.cta_url}
                onChange={(e) => setForm({ ...form, cta_url: e.target.value })}
                placeholder="/actualites ou https://…"
                className="ms-input mt-2"
              />
            </div>
          </div>
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
            {news.filter((n) => n.featured).length} en carrousel · {news.length} total
          </span>
        </div>
        <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
          {news
            .slice()
            .sort((a, b) => (a.order || 100) - (b.order || 100))
            .map((n) => (
              <div
                key={n.id}
                className={`rounded-xl border p-3 flex gap-3 items-start ${
                  n.featured ? "border-[#F59E0B]/40 bg-[#FEF3C7]/30" : "border-[#071B34]/5"
                }`}
              >
                {n.image && (
                  <img src={n.image} alt="" className="h-14 w-20 rounded-lg object-cover shrink-0" />
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
    </div>
  );
}

// ───────────────────────────────────────── RTT / CP allocation (bonus)

function LeaveGrantManager() {
  const [employees, setEmployees] = useState([]);
  const [selected, setSelected] = useState([]);
  const [type, setType] = useState("rtt");
  const [days, setDays] = useState(1);
  const [accruing, setAccruing] = useState(false);

  useEffect(() => {
    api.get("/admin/employees").then((r) => setEmployees(r.data));
  }, []);

  const reload = () => api.get("/admin/employees").then((r) => setEmployees(r.data));

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
