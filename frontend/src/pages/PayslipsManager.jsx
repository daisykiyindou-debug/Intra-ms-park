import { useEffect, useMemo, useState } from "react";
import {
  FileText, Plus, Search, Filter, Send, Eye, Download, Trash2,
  X, ArrowLeft, User as UserIcon, Building2, Coins, Euro, ChevronRight,
  Sparkles, CheckCircle2, Clock as ClockIcon, MailOpen, Save,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useApp, hasPermission } from "@/contexts/AppContext";
import PortalModal from "@/components/PortalModal";

const FR_MONTHS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

const STATUS_LABEL = {
  draft: { label: "Brouillon", cls: "bg-[#94A3B8]/20 text-[#475569]" },
  pending: { label: "En attente", cls: "bg-[#F59E0B]/20 text-[#B45309]" },
  sent: { label: "Envoyée", cls: "bg-[#10B981]/20 text-[#047857]" },
};

const eur = (n) => `${Number(n || 0).toFixed(2).replace(".", ",")} €`;

export default function PayslipsManager() {
  const { me, adminMode, employees } = useApp();
  const canManage = adminMode !== false && (!!me?.is_admin || hasPermission(me, "view_payslips", "manage_documents"));

  const [monthKey, setMonthKey] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [statusFilter, setStatusFilter] = useState("all");
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({ total: 0, employees: 0, sent: 0, pending: 0 });
  const [selectedId, setSelectedId] = useState(null);
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!canManage) return;
    setLoading(true);
    try {
      const [{ data: list }, { data: st }] = await Promise.all([
        api.get(`/admin/payslips`, { params: { month: monthKey, ...(statusFilter !== "all" ? { status: statusFilter } : {}) } }),
        api.get(`/admin/payslips/stats`, { params: { month: monthKey } }),
      ]);
      setItems(list);
      setStats(st);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [canManage, monthKey, statusFilter]);

  const filtered = useMemo(() => {
    if (!q.trim()) return items;
    const n = q.toLowerCase();
    return items.filter((p) => {
      const e = p.employee_snapshot || {};
      return `${e.first_name || ""} ${e.last_name || ""} ${e.department || ""} ${e.badge_number || ""}`.toLowerCase().includes(n);
    });
  }, [items, q]);

  const selected = useMemo(() => filtered.find((p) => p.id === selectedId) || items.find((p) => p.id === selectedId), [filtered, items, selectedId]);

  const sendPayslip = async (p) => {
    await api.post(`/admin/payslips/${p.id}/send`);
    toast.success("Fiche de paie envoyée à l'employé");
    load();
  };

  const del = async (p) => {
    if (!window.confirm(`Supprimer la fiche de ${p.employee_snapshot?.first_name} ${p.employee_snapshot?.last_name} ?`)) return;
    await api.delete(`/admin/payslips/${p.id}`);
    toast.success("Supprimée");
    setSelectedId(null);
    load();
  };

  if (!canManage) {
    return (
      <div className="ms-card p-10 text-center">
        <FileText className="mx-auto h-10 w-10 text-[#94A3B8]" />
        <h2 className="mt-3 text-lg font-bold text-[#071B34]">Mode administrateur désactivé</h2>
        <p className="mt-2 text-sm text-[#475569]">
          Activez le mode administrateur pour gérer les fiches de paie.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="ms-overline">Administration › Fiches de paie</div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[#071B34] mt-1">
            Fiches de paie
          </h1>
          <p className="text-sm text-[#475569] mt-1 max-w-2xl">
            Consultez, générez et envoyez les fiches de paie de vos employés. Une fois envoyée, la fiche apparaît instantanément dans les <strong>Documents</strong> de l&apos;employé concerné.
          </p>
        </div>
        <button
          onClick={() => setGeneratorOpen(true)}
          data-testid="new-payslip"
          className="ms-btn-primary"
        >
          <Plus className="h-4 w-4" /> Générer une fiche de paie
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPI icon={FileText} tone="#3BA4FF" label="Fiches générées" value={stats.total} testid="kpi-total" />
        <KPI icon={UserIcon} tone="#7C3AED" label="Employés concernés" value={stats.employees} testid="kpi-emps" />
        <KPI icon={Send} tone="#10B981" label="Fiches envoyées" value={stats.sent} testid="kpi-sent" />
        <KPI icon={ClockIcon} tone="#F59E0B" label="En attente d'envoi" value={stats.pending} testid="kpi-pending" />
      </div>

      {/* Filters */}
      <div className="ms-card p-3 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[220px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher un employé, une période, un numéro…"
            data-testid="payslip-search"
            className="ms-input pl-9"
          />
        </div>
        <input
          type="month"
          value={monthKey}
          onChange={(e) => setMonthKey(e.target.value)}
          data-testid="payslip-month"
          className="ms-input max-w-[180px]"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          data-testid="payslip-status"
          className="ms-input max-w-[180px]"
        >
          <option value="all">Tous les statuts</option>
          <option value="sent">Envoyée</option>
          <option value="pending">En attente</option>
          <option value="draft">Brouillon</option>
        </select>
      </div>

      {/* Content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 items-start">
        {/* Table */}
        <div className="ms-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-[#F4F7FA]">
                <tr className="text-left text-[10px] uppercase tracking-widest text-[#475569] font-semibold">
                  <th className="px-3 py-3">Employé</th>
                  <th className="px-3 py-3">Période</th>
                  <th className="px-3 py-3">Date paiement</th>
                  <th className="px-3 py-3">Brut</th>
                  <th className="px-3 py-3">Net</th>
                  <th className="px-3 py-3">Statut</th>
                  <th className="px-3 py-3">Envoyée le</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#071B34]/5">
                {loading && (
                  <tr><td colSpan={8} className="px-3 py-8 text-center text-[#475569]">Chargement…</td></tr>
                )}
                {!loading && filtered.length === 0 && (
                  <tr><td colSpan={8} className="px-3 py-10 text-center text-[#475569]">
                    Aucune fiche de paie pour cette période. Cliquez sur <strong>« Générer une fiche de paie »</strong>.
                  </td></tr>
                )}
                {!loading && filtered.map((p) => {
                  const e = p.employee_snapshot || {};
                  const st = STATUS_LABEL[p.status] || STATUS_LABEL.draft;
                  return (
                    <tr
                      key={p.id}
                      onClick={() => setSelectedId(p.id)}
                      data-testid={`payslip-row-${p.id}`}
                      className={`cursor-pointer transition-colors ${selectedId === p.id ? "bg-[#3BA4FF]/5" : "hover:bg-[#F4F7FA]"}`}
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          {e.avatar
                            ? <img src={e.avatar} alt="" className="h-8 w-8 rounded-full object-cover shrink-0" />
                            : <div className="h-8 w-8 rounded-full bg-[#3BA4FF]/15 text-[#1D70B8] flex items-center justify-center font-bold text-xs shrink-0">
                                {(e.first_name || "?")[0]}{(e.last_name || "")[0]}
                              </div>}
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-[#071B34] truncate">{e.first_name} {e.last_name}</div>
                            <div className="text-[11px] text-[#475569] truncate">{e.role || e.department || "—"}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="text-sm text-[#071B34] font-semibold">{FR_MONTHS[p.month - 1]} {p.year}</div>
                        <div className="text-[11px] text-[#475569]">{p.period_from} → {p.period_to}</div>
                      </td>
                      <td className="px-3 py-2.5 text-[#334155]">{p.payment_date || "—"}</td>
                      <td className="px-3 py-2.5 font-semibold text-[#071B34]">{eur(p.totals?.gross)}</td>
                      <td className="px-3 py-2.5 font-semibold text-[#047857]">{eur(p.totals?.net)}</td>
                      <td className="px-3 py-2.5">
                        <span className={`ms-chip !text-[10px] ${st.cls}`}>{st.label}</span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-[#475569]">
                        {p.sent_at ? new Date(p.sent_at).toLocaleDateString("fr-FR") : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="inline-flex items-center gap-1">
                          <Link
                            to={`/documents/payslip/${p.employee_id}/${p.year}/${p.month}`}
                            onClick={(e) => e.stopPropagation()}
                            data-testid={`payslip-view-${p.id}`}
                            className="h-8 w-8 inline-flex items-center justify-center rounded-lg hover:bg-[#3BA4FF]/10 text-[#3BA4FF]"
                            title="Voir la fiche"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Link>
                          {p.status !== "sent" && (
                            <button
                              onClick={(e) => { e.stopPropagation(); sendPayslip(p); }}
                              data-testid={`payslip-send-${p.id}`}
                              className="h-8 px-2.5 inline-flex items-center gap-1 rounded-lg bg-[#3BA4FF]/10 hover:bg-[#3BA4FF]/20 text-[#1D70B8] text-xs font-semibold"
                              title="Envoyer à l'employé"
                            >
                              <Send className="h-3.5 w-3.5" /> Envoyer
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); del(p); }}
                            data-testid={`payslip-delete-${p.id}`}
                            className="h-8 w-8 inline-flex items-center justify-center rounded-lg hover:bg-[#FEE2E2] text-[#B91C1C]"
                            title="Supprimer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right rail — selection details */}
        <div className="ms-card p-5 space-y-4 lg:sticky lg:top-24">
          {!selected ? (
            <div className="text-center py-10">
              <FileText className="mx-auto h-8 w-8 text-[#94A3B8]" />
              <p className="mt-2 text-sm text-[#475569]">
                Sélectionnez une fiche pour voir les détails.
              </p>
            </div>
          ) : (
            <PayslipDetail p={selected} onSend={() => sendPayslip(selected)} onDelete={() => del(selected)} />
          )}
        </div>
      </div>

      {generatorOpen && (
        <PayslipGenerator
          employees={employees}
          onClose={() => setGeneratorOpen(false)}
          onSaved={() => { setGeneratorOpen(false); load(); }}
        />
      )}
    </div>
  );
}

function KPI({ icon: Icon, tone, label, value, testid }) {
  return (
    <div className="ms-card p-4 flex items-center gap-3" data-testid={testid}>
      <div
        className="h-11 w-11 rounded-2xl flex items-center justify-center shrink-0"
        style={{ background: `${tone}15`, color: tone }}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold text-[#071B34] leading-tight">{value}</div>
        <div className="text-[11px] uppercase tracking-widest text-[#475569] font-semibold">{label}</div>
      </div>
    </div>
  );
}

function PayslipDetail({ p, onSend, onDelete }) {
  const e = p.employee_snapshot || {};
  const st = STATUS_LABEL[p.status] || STATUS_LABEL.draft;
  return (
    <>
      <div>
        <div className="ms-overline">Détails de la sélection</div>
        <div className="mt-3 flex items-center gap-3">
          {e.avatar
            ? <img src={e.avatar} alt="" className="h-12 w-12 rounded-full object-cover" />
            : <div className="h-12 w-12 rounded-full bg-[#3BA4FF]/15 text-[#1D70B8] flex items-center justify-center font-bold">
                {(e.first_name || "?")[0]}{(e.last_name || "")[0]}
              </div>}
          <div className="min-w-0">
            <div className="text-base font-bold text-[#071B34] truncate">{e.first_name} {e.last_name}</div>
            <div className="text-xs text-[#475569] truncate">{e.role || "—"}</div>
          </div>
        </div>
      </div>

      <dl className="divide-y divide-[#071B34]/5">
        <Row k="Matricule" v={e.badge_number || "—"} />
        <Row k="Service" v={e.department || "—"} />
        <Row k="Période" v={`${FR_MONTHS[p.month - 1]} ${p.year}`} />
        <Row k="Statut" v={<span className={`ms-chip !text-[10px] ${st.cls}`}>{st.label}</span>} />
      </dl>

      <div className="rounded-2xl bg-[#F4F7FA] p-4">
        <div className="ms-overline">Résumé de la fiche</div>
        <dl className="mt-2 space-y-1.5 text-sm">
          <Line k="Salaire brut" v={eur(p.totals?.gross)} />
          <Line k="Total des retenues" v={<span className="text-[#B91C1C]">-{eur(p.totals?.total_deductions)}</span>} />
          <div className="border-t border-[#071B34]/10 pt-1.5 mt-1.5">
            <Line k={<span className="font-bold text-[#071B34]">Net à payer</span>} v={<span className="text-lg font-bold text-[#047857]">{eur(p.totals?.net)}</span>} />
          </div>
        </dl>
      </div>

      <div className="space-y-2">
        <Link
          to={`/documents/payslip/${p.employee_id}/${p.year}/${p.month}`}
          data-testid="payslip-detail-view"
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-[#3BA4FF]/30 bg-[#3BA4FF]/5 hover:bg-[#3BA4FF]/10 text-[#1D70B8] text-sm font-semibold py-2.5"
        >
          <Eye className="h-4 w-4" /> Voir la fiche de paie
        </Link>
        {p.status !== "sent" ? (
          <button
            onClick={onSend}
            data-testid="payslip-detail-send"
            className="w-full ms-btn-primary"
          >
            <Send className="h-4 w-4" /> Envoyer à l&apos;employé
          </button>
        ) : (
          <div className="rounded-xl bg-[#10B981]/10 text-[#047857] text-xs font-semibold px-3 py-2 flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4" /> Envoyée le {new Date(p.sent_at).toLocaleString("fr-FR")}
          </div>
        )}
        <button
          onClick={onDelete}
          data-testid="payslip-detail-delete"
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl text-[#B91C1C] hover:bg-[#FEE2E2] text-xs font-semibold py-2"
        >
          <Trash2 className="h-3.5 w-3.5" /> Supprimer
        </button>
      </div>
    </>
  );
}

function Row({ k, v }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-sm">
      <dt className="text-[#475569]">{k}</dt>
      <dd className="text-[#071B34] font-semibold text-right">{v}</dd>
    </div>
  );
}

function Line({ k, v }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <dt className="text-[#475569]">{k}</dt>
      <dd className="text-[#071B34] font-semibold text-right">{v}</dd>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Payslip Generator (create + preview)
// ═══════════════════════════════════════════════════════════════════
const TABS = [
  { id: "auto", label: "Éléments automatiques" },
  { id: "overtime", label: "Heures supp." },
  { id: "premium", label: "Primes" },
  { id: "indemnity", label: "Indemnités" },
  { id: "deduction", label: "Autres retenues" },
];

function PayslipGenerator({ employees, onClose, onSaved }) {
  const now = new Date();
  const [step, setStep] = useState({
    employee_id: "",
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    period: "Mensuelle",
    message_subject: "",
    message_body: "",
    lines: [],
    deductions: [],
    tab: "auto",
    saving: false,
  });

  const emp = useMemo(() => employees.find((e) => e.id === step.employee_id) || null, [employees, step.employee_id]);
  const contractH = emp?.contract_hours_weekly || 35;
  const roleCat = emp?.role_category;
  const defaultHourly = roleCat === "encadrement" ? 21.5 : roleCat === "restauration" ? 13.2 : 12.85;

  // Recompute auto base line when employee/period changes
  useEffect(() => {
    if (!emp) return;
    setStep((s) => {
      const hasBase = s.lines.some((l) => l.kind === "auto");
      if (hasBase) return s;
      const monthlyH = +(contractH * 4.33).toFixed(2);
      return {
        ...s,
        lines: [
          { label: "Salaire de base", kind: "auto", base: monthlyH, rate: defaultHourly, amount: +(monthlyH * defaultHourly).toFixed(2) },
          ...s.lines,
        ],
        message_subject: s.message_subject || `Votre fiche de paie – ${FR_MONTHS[s.month - 1]} ${s.year}`,
        message_body: s.message_body ||
          `Bonjour ${emp.first_name},\n\nVeuillez trouver ci-joint votre fiche de paie pour le mois de ${FR_MONTHS[s.month - 1]} ${s.year}.\nN'hésitez pas à contacter le service RH pour toute question.\n\nCordialement,\nL'équipe RH`,
      };
    });
  }, [emp, contractH, defaultHourly, step.month, step.year]); // eslint-disable-line react-hooks/exhaustive-deps

  const totals = useMemo(() => {
    const gross = step.lines.reduce((s, l) => s + Number(l.amount || 0), 0);
    const deductionsLines = step.deductions.length ? step.deductions : [
      { label: "Sécurité sociale", rate: 15, amount: +(gross * 0.15).toFixed(2) },
      { label: "Retraite complémentaire", rate: 4, amount: +(gross * 0.04).toFixed(2) },
      { label: "Prévoyance", rate: 2, amount: +(gross * 0.02).toFixed(2) },
      { label: "Autres cotisations", rate: 1, amount: +(gross * 0.01).toFixed(2) },
    ];
    const totalD = deductionsLines.reduce((s, l) => s + Number(l.amount || 0), 0);
    return {
      gross: +gross.toFixed(2),
      deductions: deductionsLines,
      total_deductions: +totalD.toFixed(2),
      net: +(gross - totalD).toFixed(2),
    };
  }, [step.lines, step.deductions]);

  const addLine = (kind) => {
    const defaults = {
      overtime: { label: "Heures supplémentaires", kind: "overtime", base: 0, rate: defaultHourly * 1.25, amount: 0 },
      premium: { label: "Prime", kind: "premium", amount: 0 },
      indemnity: { label: "Indemnité", kind: "indemnity", amount: 0 },
      deduction: { label: "Retenue", kind: "deduction", amount: 0 },
    };
    if (kind === "deduction") {
      setStep((s) => ({ ...s, deductions: [...s.deductions, defaults.deduction] }));
    } else {
      setStep((s) => ({ ...s, lines: [...s.lines, defaults[kind]] }));
    }
  };

  const updateLine = (list, idx, key, value) => {
    setStep((s) => {
      const copy = [...s[list]];
      copy[idx] = { ...copy[idx], [key]: value };
      if ((key === "base" || key === "rate") && copy[idx].base && copy[idx].rate) {
        copy[idx].amount = +(Number(copy[idx].base) * Number(copy[idx].rate)).toFixed(2);
      }
      return { ...s, [list]: copy };
    });
  };

  const removeLine = (list, idx) => {
    setStep((s) => ({ ...s, [list]: s[list].filter((_, i) => i !== idx) }));
  };

  const save = async ({ send }) => {
    if (!step.employee_id) { toast.error("Sélectionnez un employé"); return; }
    if (step.lines.length === 0) { toast.error("Ajoutez au moins une ligne de paie"); return; }
    setStep((s) => ({ ...s, saving: true }));
    try {
      const payload = {
        employee_id: step.employee_id,
        year: step.year,
        month: step.month,
        lines: step.lines,
        deductions: step.deductions,
        message_subject: step.message_subject,
        message_body: step.message_body,
        status: send ? "pending" : "draft",
        base_hours: contractH,
        hourly_rate: defaultHourly,
      };
      const { data } = await api.post("/admin/payslips", payload);
      if (send) {
        await api.post(`/admin/payslips/${data.id}/send`);
        toast.success("Fiche générée et envoyée à l'employé");
      } else {
        toast.success("Brouillon enregistré");
      }
      onSaved();
    } catch (err) {
      toast.error("Erreur", { description: err?.response?.data?.detail });
    } finally {
      setStep((s) => ({ ...s, saving: false }));
    }
  };

  const linesForTab = step.tab === "deduction"
    ? step.deductions
    : step.lines.filter((l) => l.kind === step.tab);

  return (
    <PortalModal>
      <div onClick={onClose} className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
        <div
          onClick={(e) => e.stopPropagation()}
          data-testid="payslip-generator"
          className="bg-white rounded-3xl w-full max-w-6xl my-4 overflow-hidden shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#071B34]/5">
            <div>
              <div className="ms-overline">Administration › Fiches de paie › <span className="text-[#071B34]">Générer</span></div>
              <h2 className="text-xl font-bold text-[#071B34] mt-0.5">Générer une fiche de paie</h2>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="ms-btn-outline">Annuler</button>
              <button
                onClick={() => save({ send: true })}
                disabled={step.saving}
                data-testid="payslip-save-send"
                className="ms-btn-primary disabled:opacity-50"
              >
                <Send className="h-4 w-4" /> {step.saving ? "…" : "Générer et envoyer"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-0 max-h-[80vh] overflow-y-auto">
            {/* Left column — form */}
            <div className="p-6 space-y-5 border-r border-[#071B34]/5">
              {/* 1. Employee */}
              <section>
                <div className="text-sm font-bold text-[#071B34] mb-2">1. Sélection de l&apos;employé</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="ms-overline">Employé *</label>
                    <select
                      value={step.employee_id}
                      onChange={(e) => setStep((s) => ({ ...s, employee_id: e.target.value }))}
                      data-testid="payslip-employee"
                      className="ms-input mt-1"
                    >
                      <option value="">— Choisir un employé —</option>
                      {(employees || []).filter((e) => !e.is_super_admin).map((e) => (
                        <option key={e.id} value={e.id}>{e.first_name} {e.last_name} · {e.role || "—"}</option>
                      ))}
                    </select>
                  </div>
                  {emp && (
                    <div className="rounded-2xl border border-[#071B34]/10 p-3 space-y-1 text-xs">
                      <div className="flex items-center justify-between"><span className="text-[#475569]">Matricule</span><span className="font-semibold text-[#071B34]">{emp.badge_number || "—"}</span></div>
                      <div className="flex items-center justify-between"><span className="text-[#475569]">Contrat</span><span className="font-semibold text-[#071B34]">CDI — {contractH}h/sem</span></div>
                      <div className="flex items-center justify-between"><span className="text-[#475569]">Service</span><span className="font-semibold text-[#071B34]">{emp.department || "—"}</span></div>
                    </div>
                  )}
                </div>
              </section>

              {/* 2. Period */}
              <section>
                <div className="text-sm font-bold text-[#071B34] mb-2">2. Période de paie</div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="ms-overline">Mois *</label>
                    <select
                      value={step.month}
                      onChange={(e) => setStep((s) => ({ ...s, month: Number(e.target.value) }))}
                      data-testid="payslip-month-sel"
                      className="ms-input mt-1"
                    >
                      {FR_MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="ms-overline">Année *</label>
                    <select
                      value={step.year}
                      onChange={(e) => setStep((s) => ({ ...s, year: Number(e.target.value) }))}
                      className="ms-input mt-1"
                    >
                      {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="ms-overline">Période</label>
                    <select
                      value={step.period}
                      onChange={(e) => setStep((s) => ({ ...s, period: e.target.value }))}
                      className="ms-input mt-1"
                    >
                      <option>Mensuelle</option>
                    </select>
                  </div>
                </div>
              </section>

              {/* 3. Elements */}
              <section>
                <div className="text-sm font-bold text-[#071B34] mb-2">3. Éléments de paie</div>
                <div className="flex items-center gap-1 border-b border-[#071B34]/5 mb-3 overflow-x-auto">
                  {TABS.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setStep((s) => ({ ...s, tab: t.id }))}
                      data-testid={`payslip-tab-${t.id}`}
                      className={`px-3 py-2 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors ${
                        step.tab === t.id
                          ? "border-[#3BA4FF] text-[#1D70B8]"
                          : "border-transparent text-[#475569] hover:text-[#071B34]"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {step.tab === "auto" && (
                  <div className="rounded-xl bg-[#10B981]/10 text-[#047857] px-3 py-2 text-xs mb-2 flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5" />
                    Les éléments automatiques (salaire de base, cotisations) sont calculés à partir du contrat.
                  </div>
                )}

                <div className="space-y-2">
                  {linesForTab.length === 0 && (
                    <div className="text-xs text-[#475569] italic px-1">
                      Aucun élément dans cet onglet. Cliquez sur « + Ajouter une ligne » ci-dessous.
                    </div>
                  )}
                  {linesForTab.map((line, idx) => {
                    const realIdx = step.tab === "deduction"
                      ? idx
                      : step.lines.findIndex((l, i) => l.kind === step.tab && step.lines.slice(0, i + 1).filter((x) => x.kind === step.tab).length === idx + 1);
                    const list = step.tab === "deduction" ? "deductions" : "lines";
                    return (
                      <div key={idx} className="grid grid-cols-[1fr_100px_100px_100px_30px] gap-2 items-center">
                        <input
                          value={line.label}
                          onChange={(e) => updateLine(list, realIdx, "label", e.target.value)}
                          className="ms-input text-sm !py-1.5"
                          placeholder="Libellé"
                        />
                        <input
                          type="number"
                          step="0.01"
                          value={line.base ?? ""}
                          onChange={(e) => updateLine(list, realIdx, "base", e.target.value)}
                          placeholder="Base"
                          className="ms-input text-sm !py-1.5"
                          disabled={step.tab === "auto" && line.kind === "auto"}
                        />
                        <input
                          type="number"
                          step="0.01"
                          value={line.rate ?? ""}
                          onChange={(e) => updateLine(list, realIdx, "rate", e.target.value)}
                          placeholder="Taux"
                          className="ms-input text-sm !py-1.5"
                        />
                        <input
                          type="number"
                          step="0.01"
                          value={line.amount ?? ""}
                          onChange={(e) => updateLine(list, realIdx, "amount", Number(e.target.value))}
                          placeholder="Montant €"
                          className="ms-input text-sm !py-1.5 font-semibold"
                        />
                        {!(step.tab === "auto" && line.kind === "auto" && step.lines.filter((l) => l.kind === "auto").length <= 1) ? (
                          <button
                            onClick={() => removeLine(list, realIdx)}
                            className="h-8 w-8 rounded-lg hover:bg-[#FEE2E2] text-[#B91C1C] inline-flex items-center justify-center"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        ) : <span />}
                      </div>
                    );
                  })}
                  {step.tab !== "auto" && (
                    <button
                      onClick={() => addLine(step.tab)}
                      data-testid={`payslip-add-${step.tab}`}
                      className="text-xs font-semibold text-[#3BA4FF] hover:text-[#1D70B8] inline-flex items-center gap-1 mt-1"
                    >
                      <Plus className="h-3.5 w-3.5" /> Ajouter une ligne
                    </button>
                  )}
                </div>
              </section>

              {/* 5. Message */}
              <section>
                <div className="text-sm font-bold text-[#071B34] mb-2">4. Message pour l&apos;employé <span className="text-[#475569] font-normal">(optionnel)</span></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="ms-overline">Sujet</label>
                    <input
                      value={step.message_subject}
                      onChange={(e) => setStep((s) => ({ ...s, message_subject: e.target.value }))}
                      className="ms-input mt-1"
                      data-testid="payslip-subject"
                    />
                  </div>
                  <div>
                    <label className="ms-overline">Message</label>
                    <textarea
                      rows={4}
                      value={step.message_body}
                      onChange={(e) => setStep((s) => ({ ...s, message_body: e.target.value }))}
                      className="ms-input mt-1 font-mono text-xs"
                      data-testid="payslip-body"
                    />
                  </div>
                </div>
              </section>

              <div className="flex items-center gap-2 pt-3 border-t border-[#071B34]/5">
                <button
                  onClick={() => save({ send: false })}
                  disabled={step.saving}
                  data-testid="payslip-save-draft"
                  className="ms-btn-outline"
                >
                  <Save className="h-4 w-4" /> Enregistrer brouillon
                </button>
                <button
                  onClick={() => save({ send: true })}
                  disabled={step.saving}
                  className="ms-btn-primary"
                >
                  <Send className="h-4 w-4" /> Générer et envoyer
                </button>
              </div>
            </div>

            {/* Right column — preview */}
            <div className="bg-[#F8FAFC] p-6 space-y-4">
              <div className="ms-overline">Aperçu de la fiche de paie</div>
              <div className="rounded-2xl bg-white border border-[#071B34]/10 overflow-hidden shadow-sm">
                <div className="flex items-start justify-between px-4 py-3 bg-[#071B34] text-white">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest opacity-70">MS PARK</div>
                    <div className="text-sm font-bold">FICHE DE PAIE</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-widest opacity-70">Période</div>
                    <div className="text-sm font-bold">{FR_MONTHS[step.month - 1]} {step.year}</div>
                  </div>
                </div>
                <div className="p-4 space-y-3 text-[11px]">
                  {emp && (
                    <div className="grid grid-cols-2 gap-1 text-[#334155]">
                      <div className="text-[#475569]">Employé</div><div className="font-semibold text-right">{emp.first_name} {emp.last_name}</div>
                      <div className="text-[#475569]">Matricule</div><div className="font-semibold text-right">{emp.badge_number || "—"}</div>
                      <div className="text-[#475569]">Période</div><div className="font-semibold text-right">{FR_MONTHS[step.month - 1]} {step.year}</div>
                    </div>
                  )}

                  <div>
                    <div className="ms-overline mt-2">Rémunération brute</div>
                    {step.lines.map((l, i) => (
                      <div key={i} className="flex items-center justify-between mt-1">
                        <span className="text-[#334155]">{l.label}</span>
                        <span className="font-semibold text-[#071B34]">{eur(l.amount)}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between pt-1 border-t border-[#071B34]/10 mt-1">
                      <span className="font-bold text-[#071B34]">TOTAL BRUT</span>
                      <span className="font-bold text-[#071B34]">{eur(totals.gross)}</span>
                    </div>
                  </div>

                  <div>
                    <div className="ms-overline mt-2">Cotisations et retenues</div>
                    {totals.deductions.map((l, i) => (
                      <div key={i} className="flex items-center justify-between mt-1">
                        <span className="text-[#334155]">{l.label}</span>
                        <span className="font-semibold text-[#B91C1C]">-{eur(l.amount)}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between pt-1 border-t border-[#071B34]/10 mt-1">
                      <span className="font-bold text-[#071B34]">TOTAL RETENUES</span>
                      <span className="font-bold text-[#B91C1C]">-{eur(totals.total_deductions)}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-xl bg-[#10B981]/10 px-3 py-2.5 mt-2">
                    <span className="text-sm font-bold text-[#047857]">NET À PAYER</span>
                    <span className="text-lg font-bold text-[#047857]">{eur(totals.net)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PortalModal>
  );
}
