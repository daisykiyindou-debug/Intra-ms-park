import { useEffect, useMemo, useState } from "react";
import {
  Receipt, Plus, Search, X, Trash2, Paperclip, Check, Ban, Wallet,
  Clock, CircleCheck, Filter, Eye, MoreVertical,
} from "lucide-react";
import { toast } from "sonner";
import { api, absoluteUrl, formatDateFr } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";
import PortalModal from "@/components/PortalModal";

const CATEGORIES = [
  { k: "transport", l: "Transport" },
  { k: "repas", l: "Repas" },
  { k: "hebergement", l: "Hébergement" },
  { k: "autres", l: "Autres" },
];
const STATUS_META = {
  pending:  { l: "En attente",  cls: "bg-[#F59E0B]/15 text-[#B45309]" },
  approved: { l: "Approuvée",   cls: "bg-[#10B981]/15 text-[#047857]" },
  rejected: { l: "Refusée",     cls: "bg-[#EF4444]/15 text-[#B91C1C]" },
  refunded: { l: "Remboursée",  cls: "bg-[#3BA4FF]/15 text-[#1D70B8]" },
};

// ─────────────────────────────────────────────────────────────
// EMPLOYEE VIEW — /notes-de-frais
// ─────────────────────────────────────────────────────────────
export default function NotesDeFrais() {
  const [items, setItems] = useState([]);
  const [showNew, setShowNew] = useState(false);

  const load = async () => {
    const { data } = await api.get("/expenses");
    setItems(data);
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-5 ms-fade-up">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="ms-overline">Mon Coin RH</div>
          <div className="mt-1 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#3BA4FF]/10 text-[#3BA4FF]"><Receipt className="h-5 w-5" /></div>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[#071B34]">Notes de frais</h1>
              <p className="text-sm text-[#475569] mt-0.5">Soumettez vos dépenses professionnelles pour remboursement</p>
            </div>
          </div>
        </div>
        <button onClick={() => setShowNew(true)} data-testid="expense-create" className="ms-btn-primary">
          <Plus className="h-4 w-4" /> Nouvelle note de frais
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { k: "pending", i: Clock },
          { k: "approved", i: CircleCheck },
          { k: "refunded", i: Wallet },
          { k: "rejected", i: Ban },
        ].map(({ k, i: Icon }) => {
          const n = items.filter((it) => it.status === k).length;
          const total = items.filter((it) => it.status === k).reduce((s, it) => s + (it.total || 0), 0);
          return (
            <div key={k} className="ms-card p-4">
              <div className="flex items-center gap-2 text-[#475569] text-xs">
                <Icon className="h-3.5 w-3.5" /> {STATUS_META[k].l}
              </div>
              <div className="text-2xl font-bold text-[#071B34] mt-1">{n}</div>
              <div className="text-xs text-[#94A3B8]">{total.toFixed(2)} €</div>
            </div>
          );
        })}
      </div>

      <div className="space-y-3">
        {items.length === 0 && <div className="ms-card p-10 text-center text-sm text-[#475569]">Aucune note de frais pour le moment.</div>}
        {items.map((e) => (
          <div key={e.id} className="ms-card p-4 flex items-center gap-4 flex-wrap" data-testid={`expense-${e.id}`}>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#3BA4FF]/10 text-[#3BA4FF]"><Receipt className="h-5 w-5" /></div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="font-bold text-[#071B34]">{e.number}</div>
                <span className={`ms-chip !text-[10px] ${STATUS_META[e.status]?.cls}`}>{STATUS_META[e.status]?.l}</span>
              </div>
              <div className="text-xs text-[#475569] mt-1">
                Période {e.period} · Soumise le {formatDateFr(e.created_at?.slice(0, 10))} · {e.items?.length || 0} dépense(s)
              </div>
              {e.decision_comment && (
                <div className="text-xs italic text-[#475569] mt-1">Commentaire admin : {e.decision_comment}</div>
              )}
            </div>
            <div className="text-right">
              <div className="text-xl font-bold text-[#071B34]">{(e.total || 0).toFixed(2)} €</div>
              {e.refunded_at && <div className="text-[10px] text-[#047857]">Remboursée le {formatDateFr(e.refunded_at.slice(0, 10))}</div>}
            </div>
          </div>
        ))}
      </div>

      {showNew && <ExpenseComposer onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); load(); }} />}
    </div>
  );
}

function ExpenseComposer({ onClose, onSaved }) {
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [items, setItems] = useState([{ category: "transport", amount: "", date: "", description: "" }]);
  const [receipts, setReceipts] = useState([]);
  const [comment, setComment] = useState("");

  const total = items.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0);

  const addItem = () => setItems([...items, { category: "autres", amount: "", date: "", description: "" }]);
  const rmItem = (i) => setItems(items.filter((_, j) => j !== i));
  const setItem = (i, patch) => setItems(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));

  const uploadReceipt = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    const { data } = await api.post("/uploads", fd, { headers: { "Content-Type": "multipart/form-data" } });
    setReceipts([...receipts, { name: file.name, url: data.url }]);
  };

  const submit = async () => {
    const valid = items.filter((it) => parseFloat(it.amount) > 0);
    if (valid.length === 0) { toast.error("Ajoutez au moins une dépense"); return; }
    try {
      await api.post("/expenses", {
        period,
        items: valid.map((it) => ({ ...it, amount: parseFloat(it.amount) })),
        receipts,
        comment,
      });
      toast.success("Note de frais soumise");
      onSaved();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Erreur");
    }
  };

  return (
    <PortalModal>
    <div onClick={onClose} className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 z-10 bg-white flex items-center justify-between p-5 border-b border-[#071B34]/5">
          <h2 className="text-lg font-bold text-[#071B34]">Nouvelle note de frais</h2>
          <button onClick={onClose} className="h-9 w-9 rounded-xl hover:bg-[#F4F7FA] flex items-center justify-center"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="ms-overline">Période</label>
            <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} data-testid="expense-period" className="ms-input mt-1 max-w-[220px]" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="ms-overline">Dépenses</label>
              <button onClick={addItem} className="text-xs font-semibold text-[#3BA4FF]"><Plus className="h-3 w-3 inline" /> Ajouter</button>
            </div>
            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="rounded-xl bg-[#F4F7FA] p-3 grid grid-cols-1 md:grid-cols-[140px_100px_130px_1fr_auto] gap-2 items-center">
                  <select value={it.category} onChange={(e) => setItem(i, { category: e.target.value })} data-testid={`item-cat-${i}`} className="ms-input">
                    {CATEGORIES.map((c) => <option key={c.k} value={c.k}>{c.l}</option>)}
                  </select>
                  <input type="number" step="0.01" min="0" value={it.amount} onChange={(e) => setItem(i, { amount: e.target.value })} data-testid={`item-amount-${i}`} placeholder="Montant €" className="ms-input" />
                  <input type="date" value={it.date} onChange={(e) => setItem(i, { date: e.target.value })} className="ms-input" />
                  <input value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} placeholder="Description" className="ms-input" />
                  <button onClick={() => rmItem(i)} className="text-[#B91C1C] p-1"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
            <div className="mt-2 text-right text-sm font-bold text-[#071B34]">Total : {total.toFixed(2)} €</div>
          </div>
          <div>
            <label className="ms-overline">Justificatifs</label>
            <div className="space-y-1 mt-1">
              {receipts.map((r, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg bg-[#F4F7FA] p-2">
                  <Paperclip className="h-3.5 w-3.5 text-[#3BA4FF]" />
                  <span className="flex-1 text-xs">{r.name}</span>
                  <button onClick={() => setReceipts(receipts.filter((_, j) => j !== i))} className="text-[#B91C1C]"><X className="h-3.5 w-3.5" /></button>
                </div>
              ))}
              <label className="inline-flex items-center gap-1.5 rounded-lg bg-[#3BA4FF] text-white text-xs font-semibold px-3 py-1.5 cursor-pointer">
                <Paperclip className="h-3 w-3" /> Ajouter un justificatif
                <input type="file" className="hidden" onChange={uploadReceipt} data-testid="expense-receipt" />
              </label>
            </div>
          </div>
          <div>
            <label className="ms-overline">Commentaire</label>
            <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} className="ms-input mt-1" />
          </div>
        </div>
        <div className="sticky bottom-0 bg-white flex gap-2 justify-end p-5 border-t border-[#071B34]/5">
          <button onClick={onClose} className="ms-btn-outline">Annuler</button>
          <button onClick={submit} data-testid="expense-submit" className="ms-btn-primary">Soumettre</button>
        </div>
      </div>
    </div>
    </PortalModal>
  );
}

// ─────────────────────────────────────────────────────────────
// ADMIN VIEW — /management/notes-de-frais
// ─────────────────────────────────────────────────────────────
export function ExpensesManager() {
  const [data, setData] = useState({ items: [], stats: {} });
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [comment, setComment] = useState("");

  const load = async () => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    const { data } = await api.get(`/admin/expenses?${params}`);
    setData(data);
    if (selected) setSelected(data.items.find((it) => it.id === selected.id) || null);
  };
  useEffect(() => { load(); }, [statusFilter]); // eslint-disable-line

  const filtered = useMemo(() => {
    return data.items.filter((it) => {
      if (q && !((it.employee_name || "") + it.number).toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [data.items, q]);

  const decide = async (status) => {
    await api.put(`/admin/expenses/${selected.id}/decide`, { status, comment });
    toast.success(status === "approved" ? "Approuvée" : "Refusée");
    setComment("");
    load();
  };

  const refund = async () => {
    if (selected.status !== "approved") { await api.put(`/admin/expenses/${selected.id}/decide`, { status: "approved", comment }); }
    await api.post(`/admin/expenses/${selected.id}/refund`);
    toast.success("Remboursée");
    setComment("");
    load();
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="ms-overline">Accueil › Administration</div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[#071B34] mt-1">Notes de frais</h1>
        <p className="text-sm text-[#475569] mt-1">Consultez et gérez les notes de frais soumises par les employés.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { k: "received", l: "Reçues", cls: "text-[#3BA4FF]", ic: Receipt },
          { k: "pending",  l: "En attente", cls: "text-[#B45309]", ic: Clock },
          { k: "approved", l: "Approuvées", cls: "text-[#047857]", ic: CircleCheck },
          { k: "rejected", l: "Refusées",  cls: "text-[#B91C1C]", ic: Ban },
        ].map(({ k, l, cls, ic: Ic }) => (
          <div key={k} className="ms-card p-4">
            <div className="flex items-center gap-2 text-xs text-[#475569]"><Ic className={`h-3.5 w-3.5 ${cls}`} /> {l}</div>
            <div className="text-2xl font-bold text-[#071B34] mt-1">{data.stats?.[k] || 0}</div>
            <div className="text-xs text-[#94A3B8]">Ce mois-ci</div>
          </div>
        ))}
        <div className="ms-card p-4">
          <div className="flex items-center gap-2 text-xs text-[#475569]"><Wallet className="h-3.5 w-3.5 text-[#8B5CF6]" /> Montant total</div>
          <div className="text-xl font-bold text-[#071B34] mt-1">{(data.stats?.total_amount || 0).toFixed(2)} €</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">
        <div>
          <div className="ms-card p-3 flex flex-wrap items-center gap-3 mb-3">
            <div className="flex-1 min-w-[220px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8]" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une note, un employé…" className="ms-input pl-9" />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="ms-input max-w-[180px]">
              <option value="all">Tous les statuts</option>
              <option value="pending">En attente</option>
              <option value="approved">Approuvées</option>
              <option value="rejected">Refusées</option>
              <option value="refunded">Remboursées</option>
            </select>
          </div>

          <div className="ms-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#F4F7FA] text-[#475569] text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left p-3 font-semibold">Employé</th>
                  <th className="text-left p-3 font-semibold">Période</th>
                  <th className="text-right p-3 font-semibold">Montant</th>
                  <th className="text-left p-3 font-semibold">Statut</th>
                  <th className="text-right p-3 font-semibold w-24">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={5} className="p-8 text-center text-[#475569]">Aucune note.</td></tr>
                )}
                {filtered.map((e) => (
                  <tr
                    key={e.id}
                    onClick={() => setSelected(e)}
                    data-testid={`admin-expense-${e.id}`}
                    className={`border-t border-[#071B34]/5 hover:bg-[#3BA4FF]/5 cursor-pointer ${selected?.id === e.id ? "bg-[#3BA4FF]/10" : ""}`}
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        {e.employee_avatar ? (
                          <img src={absoluteUrl(e.employee_avatar)} alt="" className="h-8 w-8 rounded-full object-cover" />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-[#3BA4FF]/20 text-[#3BA4FF] flex items-center justify-center text-xs font-bold">
                            {(e.employee_name || "?").slice(0, 1)}
                          </div>
                        )}
                        <div>
                          <div className="font-semibold text-[#071B34]">{e.employee_name}</div>
                          <div className="text-xs text-[#475569]">{e.employee_role || ""}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-[#475569]">{e.period}</td>
                    <td className="p-3 text-right font-bold text-[#071B34]">{(e.total || 0).toFixed(2)} €</td>
                    <td className="p-3"><span className={`ms-chip !text-[10px] ${STATUS_META[e.status]?.cls}`}>{STATUS_META[e.status]?.l}</span></td>
                    <td className="p-3 text-right"><Eye className="h-4 w-4 inline text-[#475569]" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detail panel */}
        <div className="ms-card p-5 h-max lg:sticky lg:top-24">
          {!selected ? (
            <div className="text-center py-12 text-sm text-[#475569]">Sélectionnez une note pour voir les détails.</div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-bold text-[#071B34]">{selected.number}</div>
                <button onClick={() => setSelected(null)} className="h-8 w-8 rounded-lg hover:bg-[#F4F7FA] flex items-center justify-center"><X className="h-4 w-4" /></button>
              </div>
              <div className="flex items-center gap-2">
                {selected.employee_avatar ? (
                  <img src={absoluteUrl(selected.employee_avatar)} alt="" className="h-10 w-10 rounded-full object-cover" />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-[#3BA4FF]/20 text-[#3BA4FF] flex items-center justify-center text-sm font-bold">{(selected.employee_name || "?").slice(0, 1)}</div>
                )}
                <div>
                  <div className="text-sm font-bold text-[#071B34]">{selected.employee_name}</div>
                  <div className="text-xs text-[#475569]">{selected.employee_role}</div>
                </div>
              </div>
              <div className="text-xs text-[#475569]">Période {selected.period} · Soumise le {formatDateFr(selected.created_at?.slice(0, 10))}</div>

              <div className="rounded-xl bg-[#F4F7FA] p-3">
                <div className="text-xs text-[#475569]">Résumé</div>
                <div className="text-2xl font-bold text-[#071B34] mt-0.5">{(selected.total || 0).toFixed(2)} €</div>
                <div className="mt-2 space-y-1 text-xs">
                  {CATEGORIES.map((c) => (
                    <div key={c.k} className="flex justify-between text-[#475569]">
                      <span>{c.l}</span>
                      <span className="font-semibold text-[#071B34]">{(selected.by_category?.[c.k] || 0).toFixed(2)} €</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="ms-overline mb-1.5">Détails</div>
                <div className="space-y-1">
                  {(selected.items || []).map((it, i) => (
                    <div key={i} className="text-xs text-[#334155] flex justify-between rounded bg-white p-2 border border-[#071B34]/5">
                      <span>{CATEGORIES.find((c) => c.k === it.category)?.l} — {it.description || "(sans description)"} {it.date && `· ${formatDateFr(it.date)}`}</span>
                      <span className="font-semibold">{parseFloat(it.amount).toFixed(2)} €</span>
                    </div>
                  ))}
                </div>
              </div>

              {(selected.receipts || []).length > 0 && (
                <div>
                  <div className="ms-overline mb-1.5">Justificatifs</div>
                  <div className="space-y-1">
                    {selected.receipts.map((r, i) => (
                      <a key={i} href={absoluteUrl(r.url)} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs rounded-lg bg-[#F4F7FA] p-2 hover:bg-[#3BA4FF]/10">
                        <Paperclip className="h-3 w-3 text-[#3BA4FF]" /> {r.name}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="ms-overline">Commentaire (optionnel)</label>
                <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="Ajouter un commentaire…" className="ms-input mt-1" />
              </div>

              <div className="flex flex-col gap-2 pt-2 border-t border-[#071B34]/5">
                {selected.status === "pending" && (
                  <>
                    <button onClick={() => decide("rejected")} data-testid="expense-reject" className="rounded-xl bg-white border border-[#EF4444] text-[#B91C1C] text-sm font-semibold py-2 hover:bg-[#FEE2E2]">
                      <Ban className="h-3.5 w-3.5 inline mr-1" /> Refuser
                    </button>
                    <button onClick={() => decide("approved")} data-testid="expense-approve" className="rounded-xl bg-[#10B981] text-white text-sm font-semibold py-2 hover:bg-[#059669]">
                      <Check className="h-3.5 w-3.5 inline mr-1" /> Approuver
                    </button>
                    <button onClick={refund} data-testid="expense-refund" className="rounded-xl bg-[#071B34] text-white text-sm font-semibold py-2 hover:bg-[#0B2545]">
                      <Wallet className="h-3.5 w-3.5 inline mr-1" /> Approuver et rembourser
                    </button>
                  </>
                )}
                {selected.status === "approved" && (
                  <button onClick={refund} className="rounded-xl bg-[#071B34] text-white text-sm font-semibold py-2 hover:bg-[#0B2545]">
                    <Wallet className="h-3.5 w-3.5 inline mr-1" /> Marquer comme remboursée
                  </button>
                )}
                {selected.status === "refunded" && (
                  <div className="text-center text-xs text-[#047857] font-semibold">Cette note a été remboursée.</div>
                )}
                {selected.status === "rejected" && (
                  <div className="text-center text-xs text-[#B91C1C] font-semibold">Cette note a été refusée.</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
