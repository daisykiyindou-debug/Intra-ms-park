import { useEffect, useMemo, useState } from "react";
import { Clock, Check, Ban, Search, X, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { api, absoluteUrl, formatDateFr } from "@/lib/api";

const EVENT_LABELS = {
  event: "Événement", meeting: "Réunion", training: "Formation",
  inventory: "Inventaire", intervention: "Intervention", other: "Autre",
};
const STATUS = {
  pending: { l: "En attente", cls: "bg-[#F59E0B]/15 text-[#B45309]" },
  approved: { l: "Approuvée", cls: "bg-[#10B981]/15 text-[#047857]" },
  rejected: { l: "Refusée", cls: "bg-[#EF4444]/15 text-[#B91C1C]" },
};

const fmtHM = (m) => `${Math.floor(m / 60)}h${(m % 60).toString().padStart(2, "0")}`;

export default function OvertimeManager() {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("pending");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(null);
  const [comment, setComment] = useState("");

  const load = async () => {
    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    const { data } = await api.get(`/admin/overtime?${params}`);
    setItems(data);
    if (selected) setSelected(data.find((i) => i.id === selected.id) || null);
  };
  useEffect(() => { load(); }, [status]); // eslint-disable-line

  const filtered = useMemo(() => items.filter((i) => !q || ((i.employee_name || "") + i.reason).toLowerCase().includes(q.toLowerCase())), [items, q]);

  const decide = async (s) => {
    await api.put(`/admin/overtime/${selected.id}/decide`, { status: s, comment });
    toast.success(s === "approved" ? "Approuvée" : "Refusée");
    setComment("");
    load();
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="ms-overline">Accueil › Administration</div>
        <h1 className="text-3xl md:text-4xl font-bold text-[#071B34] mt-1">Heures supplémentaires & récupérations</h1>
        <p className="text-sm text-[#475569] mt-1">Validez les heures exceptionnelles et les demandes de récupération soumises par les employés.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">
        <div>
          <div className="ms-card p-3 flex flex-wrap items-center gap-3 mb-3">
            <div className="flex-1 min-w-[220px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8]" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un employé, un motif…" className="ms-input pl-9" />
            </div>
            <select value={status} onChange={(e) => setStatus(e.target.value)} data-testid="ot-admin-status" className="ms-input max-w-[180px]">
              <option value="pending">En attente</option>
              <option value="approved">Approuvées</option>
              <option value="rejected">Refusées</option>
              <option value="all">Toutes</option>
            </select>
          </div>

          <div className="ms-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#F4F7FA] text-[#475569] text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left p-3 font-semibold">Employé</th>
                  <th className="text-left p-3 font-semibold">Type</th>
                  <th className="text-left p-3 font-semibold">Motif / Date</th>
                  <th className="text-right p-3 font-semibold">Durée</th>
                  <th className="text-left p-3 font-semibold">Statut</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-[#475569]">Aucune demande.</td></tr>}
                {filtered.map((o) => (
                  <tr key={o.id} onClick={() => setSelected(o)} className={`border-t border-[#071B34]/5 hover:bg-[#3BA4FF]/5 cursor-pointer ${selected?.id === o.id ? "bg-[#3BA4FF]/10" : ""}`} data-testid={`ot-admin-${o.id}`}>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        {o.employee_avatar
                          ? <img src={absoluteUrl(o.employee_avatar)} alt="" className="h-8 w-8 rounded-full object-cover" />
                          : <div className="h-8 w-8 rounded-full bg-[#3BA4FF]/20 text-[#3BA4FF] flex items-center justify-center text-xs font-bold">{(o.employee_name || "?").slice(0, 1)}</div>}
                        <div className="font-semibold text-[#071B34]">{o.employee_name}</div>
                      </div>
                    </td>
                    <td className="p-3">
                      {o.type === "overtime_declare"
                        ? <span className="ms-chip !text-[10px] bg-[#3BA4FF]/12 text-[#1D70B8]">Heures exceptionnelles</span>
                        : <span className="ms-chip !text-[10px] bg-[#8B5CF6]/12 text-[#5B21B6]">Récupération</span>}
                    </td>
                    <td className="p-3">
                      <div className="text-[#334155]">{o.reason || (o.dates ? `${o.dates.length} jour(s)` : "-")}</div>
                      <div className="text-xs text-[#94A3B8]">{o.date ? formatDateFr(o.date) : (o.dates?.[0] ? formatDateFr(o.dates[0]) : "-")}</div>
                    </td>
                    <td className="p-3 text-right font-bold text-[#071B34]">{o.minutes ? fmtHM(o.minutes) : "-"}</td>
                    <td className="p-3"><span className={`ms-chip !text-[10px] ${STATUS[o.status]?.cls}`}>{STATUS[o.status]?.l}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detail */}
        <div className="ms-card p-5 h-max lg:sticky lg:top-24">
          {!selected ? (
            <div className="text-center py-12 text-sm text-[#475569]">Sélectionnez une demande pour voir les détails.</div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-bold text-[#071B34]">{selected.employee_name}</div>
                <button onClick={() => setSelected(null)} className="h-8 w-8 rounded-lg hover:bg-[#F4F7FA]"><X className="h-4 w-4 mx-auto" /></button>
              </div>
              <div className="text-xs text-[#475569]">Soumise le {formatDateFr(selected.created_at?.slice(0, 10))}</div>
              {selected.type === "overtime_declare" ? (
                <div className="space-y-2">
                  <div className="rounded-xl bg-[#F4F7FA] p-3">
                    <div className="text-xs text-[#475569]">Type</div>
                    <div className="font-bold text-[#071B34]">{EVENT_LABELS[selected.event_type] || selected.event_type}</div>
                  </div>
                  <div className="rounded-xl bg-[#F4F7FA] p-3">
                    <div className="text-xs text-[#475569]">Motif</div>
                    <div className="text-sm text-[#071B34]">{selected.reason}</div>
                  </div>
                  {selected.center && (
                    <div className="text-xs"><span className="text-[#475569]">Centre :</span> <span className="font-semibold">{selected.center}</span></div>
                  )}
                  <div className="rounded-xl bg-[#F4F7FA] p-3">
                    <div className="text-xs text-[#475569]">Horaires</div>
                    <div className="font-bold text-[#071B34]">
                      {selected.start_time} → {selected.end_time}
                    </div>
                    <div className="text-xs text-[#475569] mt-1">{formatDateFr(selected.date)}</div>
                    {(selected.pauses || []).map((p, i) => (
                      <div key={i} className="text-xs text-[#94A3B8]">Pause : {p.start} → {p.end}</div>
                    ))}
                  </div>
                  <div className="rounded-xl bg-[#10B981]/10 p-3 text-center">
                    <div className="text-xs text-[#475569]">Durée à valider</div>
                    <div className="text-2xl font-bold text-[#10B981]">{fmtHM(selected.minutes || 0)}</div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="rounded-xl bg-[#F4F7FA] p-3">
                    <div className="text-xs text-[#475569]">Type de récupération</div>
                    <div className="font-bold text-[#071B34]">
                      {selected.kind === "full_day" ? "Journée complète" : selected.kind === "half_day" ? "Demi-journée" : "Heures précises"}
                    </div>
                  </div>
                  <div className="rounded-xl bg-[#F4F7FA] p-3">
                    <div className="text-xs text-[#475569]">Date(s) demandée(s)</div>
                    <div className="text-sm">{(selected.dates || []).map((d) => formatDateFr(d)).join(", ")}</div>
                  </div>
                  <div className="rounded-xl bg-[#8B5CF6]/10 p-3 text-center">
                    <div className="text-xs text-[#475569]">Heures à récupérer</div>
                    <div className="text-2xl font-bold text-[#8B5CF6]">{fmtHM(selected.minutes || 0)}</div>
                  </div>
                </div>
              )}
              {selected.comment && (
                <div className="rounded-xl bg-white border border-[#071B34]/10 p-3 text-xs">
                  <div className="text-[#475569] mb-1">Commentaire de l&apos;employé</div>
                  <div className="text-[#334155]">{selected.comment}</div>
                </div>
              )}
              {selected.attachment_url && (
                <a href={absoluteUrl(selected.attachment_url)} target="_blank" rel="noreferrer" className="block rounded-xl bg-[#3BA4FF]/10 p-3 text-xs text-[#1D70B8] font-semibold hover:bg-[#3BA4FF]/20">
                  📎 {selected.attachment_name || "Pièce jointe"}
                </a>
              )}
              {selected.status === "pending" && (
                <>
                  <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Commentaire (optionnel)…" className="ms-input" />
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => decide("rejected")} data-testid="ot-reject" className="rounded-xl border border-[#EF4444] text-[#B91C1C] text-sm font-semibold py-2 hover:bg-[#FEE2E2]">
                      <Ban className="h-3.5 w-3.5 inline mr-1" /> Refuser
                    </button>
                    <button onClick={() => decide("approved")} data-testid="ot-approve" className="rounded-xl bg-[#10B981] text-white text-sm font-semibold py-2 hover:bg-[#059669]">
                      <Check className="h-3.5 w-3.5 inline mr-1" /> Approuver
                    </button>
                  </div>
                </>
              )}
              {selected.decision_comment && (
                <div className="text-xs italic text-[#475569] mt-2">Décision : {selected.decision_comment}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
