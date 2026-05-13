import { useEffect, useState } from "react";
import { Plus, FileText, Calendar as CalIcon, Banknote, Stethoscope, ArrowLeftRight, Package, X, Clock, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { api, formatDateFr } from "@/lib/api";

const TYPES = [
  { k: "conge", l: "Congé", icon: CalIcon, color: "#3BA4FF" },
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
  const [items, setItems] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    type: "conge",
    start_date: "",
    end_date: "",
    comment: "",
    amount: "",
  });

  const refresh = () => {
    const q = statusFilter === "all" ? "" : `?status=${statusFilter}`;
    api.get(`/requests${q}`).then((r) => setItems(r.data));
  };

  useEffect(refresh, [statusFilter]);

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post("/requests", {
        ...form,
        end_date: form.end_date || form.start_date,
        amount: form.amount ? parseFloat(form.amount) : null,
      });
      toast.success("Demande envoyée", { description: "Votre manager sera notifié." });
      setOpen(false);
      setForm({ type: "conge", start_date: "", end_date: "", comment: "", amount: "" });
      refresh();
    } catch (e) {
      toast.error("Erreur lors de l'envoi");
    }
  };

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
                  style={{ background: `${type?.color}1A`, color: type?.color }}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <span className="ms-chip inline-flex items-center gap-1" style={{ background: sm.bg, color: sm.color }}>
                  <StatusIcon className="h-3 w-3" /> {sm.l}
                </span>
              </div>
              <h4 className="mt-3 text-lg font-bold text-[#071B34]">{type?.l}</h4>
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

      {/* Modal */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-center justify-center p-4"
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
            data-testid="request-form"
            className="ms-card max-w-lg w-full p-6"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="ms-overline">Nouvelle demande</div>
                <h3 className="text-2xl font-bold text-[#071B34] mt-1">Que souhaitez-vous demander ?</h3>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[#071B34]/5">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5">
              <label className="ms-overline">Type</label>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {TYPES.map((t) => (
                  <button
                    type="button"
                    key={t.k}
                    onClick={() => setForm((f) => ({ ...f, type: t.k }))}
                    data-testid={`type-${t.k}`}
                    className={`rounded-xl border p-3 text-center transition-all ${
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

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <label className="ms-overline">Date début</label>
                <input
                  type="date"
                  required
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
                  data-testid="end-date"
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                  className="ms-input mt-2"
                />
              </div>
            </div>

            {form.type === "acompte" && (
              <div className="mt-4">
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

            <div className="mt-4">
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

            <button type="submit" data-testid="submit-request" className="ms-btn-primary w-full mt-5">
              Envoyer la demande
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
