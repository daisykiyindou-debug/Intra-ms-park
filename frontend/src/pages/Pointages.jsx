import { useEffect, useMemo, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight, Clock, Edit3, Info, Search, X, Save } from "lucide-react";
import { api, absoluteUrl } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";
import PortalModal from "@/components/PortalModal";
import { toast } from "sonner";

const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

const REASONS = [
  "Oubli de badge",
  "Erreur de pointage",
  "Oubli de badgeage retour",
  "Oubli de badgeage sortie",
  "Autre",
];

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const mondayOf = (d) => {
  const x = new Date(d);
  const day = x.getDay() || 7;
  x.setDate(x.getDate() - day + 1);
  x.setHours(0, 0, 0, 0);
  return x;
};

const STATUS_META = {
  "ok": { bg: "bg-[#DCFCE7]", txt: "text-[#166534]", label: "OK" },
  "à venir": { bg: "bg-[#F1F5F9]", txt: "text-[#475569]", label: "À venir" },
  "absent": { bg: "bg-[#FEE2E2]", txt: "text-[#B91C1C]", label: "Manquant" },
  "en cours": { bg: "bg-[#FEF3C7]", txt: "text-[#B45309]", label: "En cours" },
  "à compléter": { bg: "bg-[#FEF3C7]", txt: "text-[#B45309]", label: "À compléter" },
  "retard": { bg: "bg-[#FEE2E2]", txt: "text-[#B91C1C]", label: "Retard" },
  "off": { bg: "bg-[#F1F5F9]", txt: "text-[#475569]", label: "Repos" },
  "école": { bg: "bg-[#E0F2FE]", txt: "text-[#0369A1]", label: "🎓 École" },
  "conges": { bg: "bg-[#EDE9FE]", txt: "text-[#7C3AED]", label: "Congés" },
  "rtt": { bg: "bg-[#DBEAFE]", txt: "text-[#1D70B8]", label: "RTT" },
};

function fmtDur(mins) {
  if (!mins) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h${String(m).padStart(2, "0")}`;
}

export default function Pointages() {
  const { me } = useApp();
  const [employees, setEmployees] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [weekStart, setWeekStart] = useState(mondayOf(new Date()));
  const [week, setWeek] = useState(null);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    api.get("/employees").then((r) => {
      const list = (r.data || []).filter((e) => e.account_status !== "archived");
      setEmployees(list);
      if (!selectedId && list.length) setSelectedId(list[0].id);
    });
    // eslint-disable-next-line
  }, []);

  const load = () => {
    if (!selectedId) return;
    api.get(`/admin/pointages/week?employee_id=${selectedId}&week_start=${iso(weekStart)}`)
      .then((r) => setWeek(r.data))
      .catch((e) => toast.error(e.response?.data?.detail || "Erreur de chargement"));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [selectedId, weekStart]);

  const filteredEmployees = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) =>
      `${e.first_name} ${e.last_name} ${e.email || ""} ${e.role || ""}`.toLowerCase().includes(q)
    );
  }, [employees, query]);

  const selectedEmp = week?.employee || employees.find((e) => e.id === selectedId);
  const weekEndLabel = new Date(weekStart); weekEndLabel.setDate(weekEndLabel.getDate() + 6);

  return (
    <div className="space-y-4 ms-fade-up" data-testid="pointages-page">
      <div className="ms-card p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#3BA4FF]/15 text-[#1D70B8]">
            <Clock className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <div className="ms-overline text-[#1D70B8]">Espace admin</div>
            <h1 className="text-2xl font-bold tracking-tight text-[#071B34]">Gestion des pointages</h1>
            <p className="text-sm text-[#475569] mt-0.5">
              Consultez et modifiez les horaires de badge des employés en cas d'oubli, d'erreur ou d'absence de badge.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
        {/* Liste employés */}
        <aside className="ms-card p-3 h-fit">
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8]" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher…"
              className="ms-input !pl-8 !py-2 !text-xs"
              data-testid="employee-search"
            />
          </div>
          <div className="space-y-1 max-h-[560px] overflow-y-auto">
            {filteredEmployees.map((e) => (
              <button
                key={e.id}
                onClick={() => setSelectedId(e.id)}
                data-testid={`employee-${e.id}`}
                className={`w-full text-left flex items-center gap-2 rounded-lg px-2 py-2 text-xs transition-colors ${
                  selectedId === e.id ? "bg-[#3BA4FF]/12 text-[#1D70B8]" : "text-[#475569] hover:bg-[#F4F7FA]"
                }`}
              >
                <img src={absoluteUrl(e.avatar)} alt="" className="h-8 w-8 rounded-full object-cover shrink-0" />
                <div className="min-w-0">
                  <div className="font-semibold truncate">{e.first_name} {e.last_name}</div>
                  <div className="text-[10px] text-[#94A3B8] truncate">{e.role || e.service}</div>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="ms-card p-4">
          {selectedEmp && (
            <div className="flex items-center gap-3 pb-4 border-b border-[#071B34]/5">
              <img src={absoluteUrl(selectedEmp.avatar)} alt="" className="h-12 w-12 rounded-full object-cover" />
              <div className="flex-1">
                <div className="text-base font-bold text-[#071B34]">
                  {selectedEmp.first_name} {selectedEmp.last_name}
                </div>
                <div className="text-xs text-[#475569]">
                  ID : {selectedEmp.id.slice(-6).toUpperCase()} · {selectedEmp.role || "—"} · {selectedEmp.contract || "—"}
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mt-4 mb-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d); }}
                data-testid="prev-week"
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F4F7FA] hover:bg-[#3BA4FF]/10"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-1.5 rounded-lg bg-[#F4F7FA] px-3 py-1.5 text-xs font-semibold text-[#475569]">
                <Calendar className="h-3.5 w-3.5" />
                Semaine du {weekStart.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} au {weekEndLabel.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
              </div>
              <button
                onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d); }}
                data-testid="next-week"
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F4F7FA] hover:bg-[#3BA4FF]/10"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <button
              onClick={() => setWeekStart(mondayOf(new Date()))}
              className="ms-btn-outline !text-xs"
              data-testid="today"
            >
              Aujourd'hui
            </button>
          </div>

          <div className="rounded-xl border border-[#071B34]/5 overflow-hidden">
            <table className="w-full text-xs" data-testid="pointages-table">
              <thead className="bg-[#F8FAFC] text-[10px] uppercase tracking-wider font-bold text-[#475569]">
                <tr>
                  <th className="text-left px-3 py-2">Date</th>
                  <th className="text-left px-3 py-2">Jour</th>
                  <th className="text-left px-3 py-2">Entrée</th>
                  <th className="text-left px-3 py-2">Pause</th>
                  <th className="text-left px-3 py-2">Retour</th>
                  <th className="text-left px-3 py-2">Sortie</th>
                  <th className="text-left px-3 py-2">Durée</th>
                  <th className="text-left px-3 py-2">Statut</th>
                  <th className="text-right px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {(week?.rows || []).map((r, i) => {
                  const status = STATUS_META[r.status] || STATUS_META["à venir"];
                  const dObj = new Date(r.day);
                  const dDD = dObj.getDate();
                  const dMM = dObj.getMonth() + 1;
                  const isOff = ["off", "conges", "rtt", "école"].includes(r.status);
                  return (
                    <tr key={r.day} className={`border-t border-[#071B34]/5 ${r.admin_edited ? "bg-[#EFF6FF]/40" : ""}`}>
                      <td className="px-3 py-2 tabular-nums text-[#334155]">
                        {String(dDD).padStart(2,"0")}/{String(dMM).padStart(2,"0")}
                      </td>
                      <td className="px-3 py-2 text-[#475569]">{WEEKDAYS[i]}.</td>
                      <td className="px-3 py-2 tabular-nums font-semibold text-[#071B34]">{r.clock_in || "—"}</td>
                      <td className="px-3 py-2 tabular-nums">{r.break_out || "—"}</td>
                      <td className="px-3 py-2 tabular-nums">{r.break_in || "—"}</td>
                      <td className="px-3 py-2 tabular-nums font-semibold text-[#071B34]">{r.clock_out || "—"}</td>
                      <td className="px-3 py-2 tabular-nums text-[#475569]">{fmtDur(r.worked_minutes)}</td>
                      <td className="px-3 py-2">
                        <span className={`ms-chip ${status.bg} ${status.txt}`}>{status.label}</span>
                        {r.admin_edited && (
                          <span className="ml-1 text-[9px] text-[#3BA4FF]" title="Modifié par un admin">✎</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          disabled={isOff}
                          onClick={() => setEditing(r)}
                          data-testid={`edit-${r.day}`}
                          className={`flex h-7 w-7 items-center justify-center rounded-lg ml-auto ${
                            isOff
                              ? "bg-[#F1F5F9] text-[#94A3B8] cursor-not-allowed"
                              : r.status === "absent" || r.status === "à compléter"
                              ? "bg-[#3BA4FF] text-white hover:bg-[#2A8DE0]"
                              : "bg-[#F4F7FA] text-[#475569] hover:bg-[#3BA4FF]/10 hover:text-[#3BA4FF]"
                          }`}
                          title={isOff ? "Journée non travaillée" : "Modifier le pointage"}
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 rounded-xl bg-[#F0F9FF] border border-[#3BA4FF]/20 p-3 flex items-start gap-2">
            <Info className="h-4 w-4 text-[#1D70B8] shrink-0 mt-0.5" />
            <div className="text-[11px] text-[#1D70B8] leading-relaxed">
              <strong>Les modifications sont tracées.</strong> Chaque changement est enregistré avec la date, l'auteur et le motif. L'employé reçoit une notification et le calcul des heures est instantané.
            </div>
          </div>
        </section>
      </div>

      {editing && selectedEmp && (
        <EditPunchModal
          employee={selectedEmp}
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function EditPunchModal({ employee, row, onClose, onSaved }) {
  const [form, setForm] = useState({
    clock_in: row.clock_in || row.sched_start || "",
    break_out: row.break_out || row.sched_pause_start || "",
    break_in: row.break_in || row.sched_pause_end || "",
    clock_out: row.clock_out || row.sched_end || "",
    reason: "Oubli de badge",
    comment: "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Calcul durée locale
  const durLabel = useMemo(() => {
    if (!form.clock_in || !form.clock_out) return "—";
    const toMin = (hm) => {
      const [h, m] = (hm || "00:00").split(":").map(Number);
      return h * 60 + m;
    };
    let d = toMin(form.clock_out) - toMin(form.clock_in);
    if (d <= 0) d += 24 * 60;
    if (form.break_out && form.break_in) {
      d -= Math.max(0, toMin(form.break_in) - toMin(form.break_out));
    }
    d = Math.max(0, d);
    return `${Math.floor(d / 60)}h${String(d % 60).padStart(2, "0")}`;
  }, [form]);

  const save = async () => {
    setBusy(true);
    try {
      await api.put(`/admin/pointages/${employee.id}/${row.day}`, form);
      toast.success("Pointage régularisé", {
        description: "L'employé a été notifié. Les calculs sont recalculés instantanément.",
      });
      onSaved?.();
    } catch (e) {
      toast.error("Erreur", { description: e.response?.data?.detail || "Impossible d'enregistrer" });
    } finally {
      setBusy(false);
    }
  };

  const dObj = new Date(row.day);

  return (
    <PortalModal onClose={onClose}>
      <div onClick={onClose} className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
        <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-white rounded-2xl p-5 shadow-2xl" data-testid="edit-punch-modal">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-lg font-bold text-[#071B34]">Modifier le pointage</div>
            <div className="text-xs text-[#475569]">
              {employee.first_name} {employee.last_name} · {dObj.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
            </div>
          </div>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[#071B34]/5">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="ms-overline">Entrée</label>
            <input type="time" value={form.clock_in} onChange={(e) => set("clock_in", e.target.value)}
              data-testid="punch-clock-in" className="ms-input mt-1.5" />
          </div>
          <div>
            <label className="ms-overline">Sortie</label>
            <input type="time" value={form.clock_out} onChange={(e) => set("clock_out", e.target.value)}
              data-testid="punch-clock-out" className="ms-input mt-1.5" />
          </div>
          <div>
            <label className="ms-overline">Début pause</label>
            <input type="time" value={form.break_out} onChange={(e) => set("break_out", e.target.value)}
              data-testid="punch-break-out" className="ms-input mt-1.5" />
          </div>
          <div>
            <label className="ms-overline">Fin pause</label>
            <input type="time" value={form.break_in} onChange={(e) => set("break_in", e.target.value)}
              data-testid="punch-break-in" className="ms-input mt-1.5" />
          </div>
        </div>

        <div className="mt-3 rounded-xl bg-[#F4F7FA] px-3 py-2 flex items-center justify-between text-xs">
          <span className="text-[#475569] font-semibold">Durée calculée</span>
          <span className="text-[#071B34] font-bold tabular-nums">{durLabel}</span>
        </div>

        <div className="mt-3">
          <label className="ms-overline">Motif</label>
          <select
            value={form.reason}
            onChange={(e) => set("reason", e.target.value)}
            data-testid="punch-reason"
            className="ms-input mt-1.5"
          >
            {REASONS.map((r) => <option key={r}>{r}</option>)}
          </select>
        </div>

        <div className="mt-3">
          <label className="ms-overline">Commentaire (facultatif)</label>
          <textarea
            value={form.comment}
            onChange={(e) => set("comment", e.target.value)}
            rows={2}
            data-testid="punch-comment"
            placeholder="Ajout manuel suite à un oubli de badge…"
            className="ms-input mt-1.5 !py-2"
          />
        </div>

        <div className="mt-5 flex gap-2">
          <button onClick={onClose} disabled={busy} className="ms-btn-outline flex-1">Annuler</button>
          <button onClick={save} disabled={busy} className="ms-btn-primary flex-1" data-testid="punch-save">
            <Save className="h-4 w-4" /> Enregistrer
          </button>
        </div>
      </div>
      </div>
    </PortalModal>
  );
}
