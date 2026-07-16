import { useState } from "react";
import { createPortal } from "react-dom";
import {
  Plus, FileText, Calendar as CalIcon, Banknote, Stethoscope, ArrowLeftRight, Package,
  X, Clock, CheckCircle2, XCircle, Info, Paperclip, Sun,
} from "lucide-react";
import { toast } from "sonner";
import { api, formatDateFr } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";
import useLiveData, { notifyLiveRefresh } from "@/hooks/useLiveData";
import LeaveCalendar from "@/components/LeaveCalendar";

const TYPES = [
  { k: "conge", l: "Congé payé", icon: CalIcon, color: "#3BA4FF" },
  { k: "rtt", l: "RTT", icon: Sun, color: "#F59E0B" },
  { k: "absence", l: "Absence", icon: Clock, color: "#F59E0B" },
  { k: "echange", l: "Échange horaires", icon: ArrowLeftRight, color: "#A78BFA" },
  { k: "acompte", l: "Acompte", icon: Banknote, color: "#10B981" },
  { k: "materiel", l: "Matériel", icon: Package, color: "#0EA5E9" },
  { k: "maladie", l: "Arrêt maladie", icon: Stethoscope, color: "#EF4444" },
];

const STATUSES = [
  { k: "all", l: "Toutes" },
  { k: "pending", l: "En attente" },
  { k: "approved", l: "Validées" },
  { k: "rejected", l: "Refusées" },
];

const statusMeta = {
  pending: { l: "En attente", color: "#F59E0B", bg: "#FEF3C7", icon: Clock },
  approved: { l: "Validée", color: "#10B981", bg: "#D1FAE5", icon: CheckCircle2 },
  rejected: { l: "Refusée", color: "#EF4444", bg: "#FEE2E2", icon: XCircle },
};

export default function Demandes() {
  const { me, refreshMe } = useApp();
  const [items, setItems] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [form, setForm] = useState({
    type: "conge",
    start_date: "",
    end_date: "",
    comment: "",
    amount: "",
    attachment_name: "",
    dates: [], // for interactive calendar (conge/rtt/absence)
  });

  const refresh = () => {
    const q = statusFilter === "all" ? "" : `?status=${statusFilter}`;
    api.get(`/requests${q}`).then((r) => setItems(r.data));
    // Always refetch /me so leave balance reflects the latest server state
    // (e.g. after an admin approved a request in another tab/window).
    refreshMe?.();
  };

  useLiveData(refresh, ["requests", "me"], [statusFilter]);

  const submit = async (e) => {
    e.preventDefault();
    const usesCalendar = ["conge", "rtt", "absence"].includes(form.type);
    const comment = form.attachment_name
      ? `${form.comment} [PJ: ${form.attachment_name}]`
      : form.comment;

    try {
      if (usesCalendar) {
        if (!form.dates || form.dates.length === 0) {
          toast.error("Sélectionnez au moins une journée dans le calendrier");
          return;
        }
        const res = await api.post("/requests/multi", {
          type: form.type,
          dates: form.dates,
          comment,
        });
        const n = res.data?.created || 1;
        toast.success(`${form.dates.length} jour${form.dates.length > 1 ? "s" : ""} demandé${form.dates.length > 1 ? "s" : ""}`, {
          description: `${n} demande${n > 1 ? "s" : ""} envoyée${n > 1 ? "s" : ""} à votre manager.`,
        });
      } else {
        await api.post("/requests", {
          type: form.type,
          start_date: form.start_date,
          end_date: form.end_date || form.start_date,
          comment,
          amount: form.amount ? parseFloat(form.amount) : null,
        });
        toast.success("Demande envoyée", { description: "Votre manager sera notifié." });
      }
      setOpen(false);
      setForm({ type: "conge", start_date: "", end_date: "", comment: "", amount: "", attachment_name: "", dates: [] });
      refresh();
      notifyLiveRefresh(["requests", "notifications"]);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      if (detail && typeof detail === "object" && detail.invalid_dates) {
        toast.error(detail.message || "Certaines dates ne sont pas disponibles", {
          description: detail.invalid_dates.slice(0, 3).join(" · "),
        });
      } else {
        toast.error(typeof detail === "string" ? detail : "Impossible d'envoyer la demande");
      }
    }
  };

  const balance = me?.leave_balance || { cp_n_1: 0, cp_n: 0, rtt: 0 };
  const totalCP = balance.cp_n_1 + balance.cp_n;
  const todayIso = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  return (
    <div className="space-y-6 ms-fade-up">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <div className="ms-overline">Mon Coin RH</div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[#071B34] mt-1">Demandes RH</h1>
          <p className="text-sm text-[#475569] mt-2">
            Soumettez vos demandes de congés, absences, échanges et plus encore.
          </p>
        </div>
        <button onClick={() => setOpen(true)} data-testid="new-request" className="ms-btn-primary">
          <Plus className="h-4 w-4" /> Nouvelle demande
        </button>
      </div>

      {/* Leave balance card */}
      <div className="ms-card p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#3BA4FF]/12 text-[#3BA4FF]">
              <Sun className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#071B34]">Suivi de mes congés</h3>
              <p className="text-xs text-[#475569]">Soldes accumulés (simulés)</p>
            </div>
          </div>
          <button
            onClick={() => setInfoOpen(true)}
            data-testid="leave-info"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F4F7FA] hover:bg-[#3BA4FF]/10 transition-colors"
          >
            <Info className="h-4 w-4 text-[#3BA4FF]" />
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <BalanceCard label="CP N-1" sub="Acquis l'an dernier" value={balance.cp_n_1} color="#A78BFA" />
          <BalanceCard label="CP N" sub="Année en cours" value={balance.cp_n} color="#3BA4FF" />
          <BalanceCard label="RTT" sub="Récup. temps de travail" value={balance.rtt} color="#10B981" />
        </div>
        <div className="mt-4 rounded-xl bg-[#F4F7FA] p-3 text-xs text-[#475569]">
          ✨ Total congés payés disponibles :{" "}
          <strong className="text-[#071B34]">{totalCP} jours</strong> · à utiliser avant le 31 mai 2027.
        </div>
      </div>

      <div className="ms-card p-4 flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button
            key={s.k}
            onClick={() => setStatusFilter(s.k)}
            data-testid={`status-${s.k}`}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
              statusFilter === s.k ? "bg-[#071B34] text-white" : "bg-[#F4F7FA] text-[#475569] hover:bg-[#071B34]/5"
            }`}
          >
            {s.l}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.length === 0 && (
          <div className="ms-card p-8 col-span-full text-center text-sm text-[#475569]">
            Aucune demande dans cette catégorie.
          </div>
        )}
        {items.map((r) => {
          const type = TYPES.find((t) => t.k === r.type);
          const sm = statusMeta[r.status];
          const Icon = type?.icon || FileText;
          const StatusIcon = sm.icon;
          return (
            <div key={r.id} className="ms-card ms-card-hover p-5" data-testid={`req-${r.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-xl"
                  style={{ background: `${type?.color || "#3BA4FF"}1A`, color: type?.color || "#3BA4FF" }}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <span
                  className="ms-chip inline-flex items-center gap-1"
                  style={{ background: sm.bg, color: sm.color }}
                >
                  <StatusIcon className="h-3 w-3" /> {sm.l}
                </span>
              </div>
              <h4 className="mt-3 text-lg font-bold text-[#071B34]">{type?.l || r.type}</h4>
              <p className="text-sm text-[#475569] mt-1">
                {formatDateFr(r.start_date)}
                {r.end_date && r.end_date !== r.start_date ? ` → ${formatDateFr(r.end_date)}` : ""}
              </p>
              {r.comment && <p className="mt-2 text-xs text-[#475569] italic">"{r.comment}"</p>}
              {r.amount && (
                <div className="mt-3 inline-flex items-center gap-1 rounded-lg bg-[#10B981]/10 px-2 py-1 text-xs font-semibold text-[#065F46]">
                  Montant : {r.amount.toFixed(2)} €
                </div>
              )}
              <div className="mt-3 text-[10px] uppercase tracking-wider text-[#475569]">
                Créée le {formatDateFr(r.created_at.slice(0, 10))}
              </div>
            </div>
          );
        })}
      </div>

      {/* New request modal */}
      {open && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-md flex items-start md:items-center justify-center p-4 overflow-y-auto"
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
            data-testid="request-form"
            className="ms-card max-w-6xl w-full p-6 my-8"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="ms-overline">Nouvelle demande</div>
                <h3 className="text-2xl font-bold text-[#071B34] mt-1">
                  Que souhaitez-vous demander ?
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[#071B34]/5"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className={`mt-5 grid gap-5 ${["conge", "rtt", "absence"].includes(form.type) ? "lg:grid-cols-[minmax(260px,340px)_1fr]" : ""}`}>
              {/* Left column — settings, comment, amount, submit */}
              <div className="space-y-4">
                <div>
                  <label className="ms-overline">Type</label>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {TYPES.map((t) => (
                      <button
                        type="button"
                        key={t.k}
                        onClick={() => setForm((f) => ({ ...f, type: t.k }))}
                        data-testid={`type-${t.k}`}
                        className={`rounded-xl border p-2.5 text-center transition-all ${
                          form.type === t.k
                            ? "border-[#3BA4FF] bg-[#3BA4FF]/8 shadow-md"
                            : "border-[#071B34]/8 hover:border-[#3BA4FF]/40"
                        }`}
                      >
                        <t.icon className="h-4 w-4 mx-auto" style={{ color: t.color }} />
                        <div className="text-[11px] font-semibold text-[#071B34] mt-1">{t.l}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {!["conge", "rtt", "absence"].includes(form.type) && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="ms-overline">Date début</label>
                      <input
                        type="date"
                        required
                        min={todayIso}
                        data-testid="start-date"
                        value={form.start_date}
                        onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                        className="ms-input mt-2"
                      />
                    </div>
                    <div>
                      <label className="ms-overline">Date fin</label>
                      <input
                        type="date"
                        min={form.start_date || todayIso}
                        data-testid="end-date"
                        value={form.end_date}
                        onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                        className="ms-input mt-2"
                      />
                    </div>
                  </div>
                )}

                {form.type === "acompte" && (
                  <div>
                    <label className="ms-overline">Montant (€)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      data-testid="amount"
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                      className="ms-input mt-2"
                    />
                  </div>
                )}

                <div>
                  <label className="ms-overline">Commentaire</label>
                  <textarea
                    rows={3}
                    data-testid="comment"
                    value={form.comment}
                    onChange={(e) => setForm({ ...form, comment: e.target.value })}
                    className="ms-input mt-2 resize-none"
                    placeholder="Précisez le motif…"
                  />
                </div>

                {form.type === "maladie" && (
                  <div>
                    <label className="ms-overline flex items-center gap-1">
                      <Paperclip className="h-3 w-3" /> Justificatif (arrêt maladie)
                    </label>
                    <label
                      className="mt-2 flex items-center gap-2 rounded-xl border border-dashed border-[#071B34]/20 px-3 py-2.5 hover:border-[#3BA4FF] cursor-pointer transition-colors"
                    >
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        data-testid="attachment"
                        onChange={(e) => setForm({ ...form, attachment_name: e.target.files?.[0]?.name || "" })}
                        className="hidden"
                      />
                      <Paperclip className="h-4 w-4 text-[#3BA4FF] shrink-0" />
                      <span className="text-xs text-[#475569] truncate">
                        {form.attachment_name || "Choisir un fichier (PDF, image)…"}
                      </span>
                    </label>
                  </div>
                )}

                <button type="submit" data-testid="submit-request" className="ms-btn-primary w-full mt-2">
                  Envoyer la demande
                </button>
              </div>

              {/* Right column — interactive calendar (only for conge/rtt/absence) */}
              {["conge", "rtt", "absence"].includes(form.type) && (
                <div>
                  <label className="ms-overline block mb-2">Sélectionnez vos jours dans le calendrier</label>
                  <LeaveCalendar
                    value={form.dates}
                    onChange={(d) => setForm({ ...form, dates: d })}
                  />
                </div>
              )}
            </div>
          </form>
        </div>,
        document.body
      )}

      {/* Info modal */}
      {infoOpen && createPortal(
        <div
          role="dialog"
          onClick={() => setInfoOpen(false)}
          className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-md flex items-center justify-center p-4"
        >
          <div onClick={(e) => e.stopPropagation()} className="ms-card max-w-md w-full p-6">
            <div className="flex items-start justify-between mb-3">
              <h3 className="text-lg font-bold text-[#071B34]">Comprendre les soldes</h3>
              <button
                onClick={() => setInfoOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[#071B34]/5"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul className="space-y-3 text-sm text-[#475569]">
              <li>
                <strong className="text-[#071B34]">CP N-1</strong> : congés payés acquis l'année précédente
                (du 1er juin N-2 au 31 mai N-1). À consommer en priorité avant le 31 mai prochain.
              </li>
              <li>
                <strong className="text-[#071B34]">CP N</strong> : congés payés acquis cette année
                (à raison de 2,08 jours par mois travaillé). Utilisables dès leur acquisition.
              </li>
              <li>
                <strong className="text-[#071B34]">RTT</strong> : jours de récupération du temps de travail
                pour les semaines au-delà de 35h. À utiliser avant le 31 décembre.
              </li>
            </ul>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function BalanceCard({ label, sub, value, color }) {
  return (
    <div className="rounded-2xl border border-[#071B34]/5 p-4">
      <div className="flex items-center justify-between">
        <span className="ms-overline">{label}</span>
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-3xl font-extrabold tracking-tight" style={{ color }}>
          {value}
        </span>
        <span className="text-sm text-[#475569]">jours</span>
      </div>
      <div className="text-[11px] text-[#475569] mt-0.5">{sub}</div>
    </div>
  );
}
