import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Edit3, Trash2, Calendar, Users, Check, X as XIcon, Clock } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";

function formatDT(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const date = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }).replace(":", "h");
  return `${date.charAt(0).toUpperCase()}${date.slice(1)} · ${time}`;
}
function formatTime(iso) {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }).replace(":", "h");
}

export default function MesReservations() {
  const { employees, me } = useApp();
  const [tab, setTab] = useState("upcoming");
  const [items, setItems] = useState([]);
  const [expanded, setExpanded] = useState(null);

  const load = () => {
    api.get(`/reservations?scope=${tab}`).then((r) => setItems(r.data)).catch(() => setItems([]));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tab]);

  const cancel = async (r) => {
    const reason = window.prompt("Motif d'annulation (optionnel) :", "");
    if (reason === null) return;
    try {
      await api.post(`/reservations/${r.id}/cancel`, { reason });
      toast.success("Réservation annulée");
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Impossible d'annuler");
    }
  };

  return (
    <div className="ms-fade-up">
      <div className="mb-5 flex items-center gap-3">
        <Link to="/salles" className="ms-btn-secondary" data-testid="mine-back">
          <ArrowLeft className="h-4 w-4" /> Salles
        </Link>
        <div>
          <div className="text-[11px] uppercase tracking-widest text-[#94A3B8]">Salles de réunion</div>
          <h1 className="text-2xl font-bold text-[#071B34] flex items-center gap-2">
            <Calendar className="h-6 w-6 text-[#3BA4FF]" />
            Mes réservations
          </h1>
        </div>
      </div>

      <div className="ms-card overflow-hidden">
        <div className="border-b border-[#071B34]/5 flex gap-4 px-5 pt-3">
          {[
            { k: "upcoming", l: "À venir" },
            { k: "history", l: "Historique" },
          ].map((t) => (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              data-testid={`mine-tab-${t.k}`}
              className={`pb-3 text-sm font-semibold transition ${tab === t.k ? "text-[#3BA4FF] border-b-2 border-[#3BA4FF]" : "text-[#475569] hover:text-[#071B34]"}`}
            >
              {t.l}
            </button>
          ))}
        </div>
        <div className="p-5 space-y-2">
          {items.length === 0 && <div className="text-center text-sm text-[#475569] py-12">Aucune réservation.</div>}
          {items.map((r) => {
            const isOpen = expanded === r.id;
            const isOrganizer = r.organizer_id === me?.id;
            const responses = r.participant_responses || {};
            const invitees = (r.participants_ids || []).filter((pid) => pid !== r.organizer_id);
            const findEmp = (id) => (employees || []).find((e) => e.id === id);
            const myResp = responses[me?.id] || "pending";
            const respondNow = async (response) => {
              try {
                await api.post(`/reservations/${r.id}/respond`, { response });
                toast.success(response === "confirmed" ? "Présence confirmée" : "Invitation déclinée");
                load();
              } catch (err) {
                toast.error(err?.response?.data?.detail || "Erreur");
              }
            };
            return (
              <div key={r.id} className="rounded-2xl ring-1 ring-[#071B34]/10 overflow-hidden" data-testid={`mine-res-${r.id}`}>
                <div className="p-4 flex items-center gap-4">
                  {r.room_photo && <img src={r.room_photo} alt="" className="h-16 w-24 rounded-xl object-cover shrink-0" onError={(e) => { e.currentTarget.style.display = "none"; }} />}
                  <div className="flex-1 min-w-0">
                    <div className="text-base font-bold text-[#071B34] truncate flex items-center gap-2">
                      {r.title}
                      {isOrganizer && <span className="text-[10px] font-bold text-[#1D70B8] bg-[#3BA4FF]/15 px-1.5 py-0.5 rounded-full">Organisateur</span>}
                      {!isOrganizer && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                          myResp === "confirmed" ? "bg-emerald-100 text-emerald-800" :
                          myResp === "declined" ? "bg-red-100 text-red-800" :
                          "bg-amber-100 text-amber-800"
                        }`}>
                          {myResp === "confirmed" ? "Confirmé" : myResp === "declined" ? "Décliné" : "En attente"}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[#475569] mt-0.5">
                      <span className="font-semibold">{r.room_name}</span> · {formatDT(r.start_ts)} – {formatTime(r.end_ts)}
                      {r.status === "cancelled" && <span className="ml-2 text-red-600 font-semibold">· Annulée</span>}
                    </div>
                  </div>
                  {isOrganizer && r.status !== "cancelled" && new Date(r.end_ts) >= new Date() && (
                    <div className="flex items-center gap-1">
                      <Link to={`/salles/${r.room_id}/reserver`} title="Modifier" className="h-9 w-9 rounded-lg hover:bg-[#F4F7FA] inline-flex items-center justify-center text-[#3BA4FF]" data-testid={`mine-edit-${r.id}`}>
                        <Edit3 className="h-4 w-4" />
                      </Link>
                      <button onClick={() => cancel(r)} title="Annuler" className="h-9 w-9 rounded-lg hover:bg-[#FEE2E2] inline-flex items-center justify-center text-[#B91C1C]" data-testid={`mine-cancel-${r.id}`}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                  {!isOrganizer && myResp === "pending" && r.status !== "cancelled" && new Date(r.end_ts) >= new Date() && (
                    <div className="flex items-center gap-1">
                      <button onClick={() => respondNow("confirmed")} title="Confirmer" className="h-9 px-3 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-xs font-semibold inline-flex items-center gap-1" data-testid={`mine-accept-${r.id}`}>
                        <Check className="h-3.5 w-3.5" /> Oui
                      </button>
                      <button onClick={() => respondNow("declined")} title="Décliner" className="h-9 px-3 rounded-lg bg-red-100 hover:bg-red-200 text-red-800 text-xs font-semibold inline-flex items-center gap-1" data-testid={`mine-decline-${r.id}`}>
                        <XIcon className="h-3.5 w-3.5" /> Non
                      </button>
                    </div>
                  )}
                  <button onClick={() => setExpanded(isOpen ? null : r.id)} className="text-xs font-semibold text-[#3BA4FF] hover:underline shrink-0" data-testid={`mine-toggle-${r.id}`}>
                    {isOpen ? "Masquer" : "Détails"}
                  </button>
                </div>
                {isOpen && (
                  <div className="border-t border-[#071B34]/5 bg-[#F8FAFC] p-4 space-y-3">
                    {r.description && (
                      <div className="text-xs text-[#334155] whitespace-pre-wrap"><b>Ordre du jour :</b> {r.description}</div>
                    )}
                    <div>
                      <div className="text-[10px] uppercase tracking-widest font-semibold text-[#475569] mb-2 flex items-center gap-1">
                        <Users className="h-3 w-3" /> Participants ({invitees.length})
                      </div>
                      {invitees.length === 0 ? (
                        <div className="text-xs text-[#94A3B8]">Aucun invité (hors organisateur).</div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {invitees.map((pid) => {
                            const emp = findEmp(pid);
                            const st = responses[pid] || "pending";
                            const stMeta = st === "confirmed"
                              ? { l: "Confirmé", cls: "bg-emerald-100 text-emerald-800", Icon: Check }
                              : st === "declined"
                              ? { l: "Décliné", cls: "bg-red-100 text-red-800", Icon: XIcon }
                              : { l: "En attente", cls: "bg-amber-100 text-amber-800", Icon: Clock };
                            return (
                              <div key={pid} className="flex items-center gap-2 rounded-lg bg-white ring-1 ring-[#071B34]/5 px-2 py-1.5" data-testid={`part-${r.id}-${pid}`}>
                                {emp?.avatar
                                  ? <img src={emp.avatar} alt="" className="h-6 w-6 rounded-full object-cover" />
                                  : <div className="h-6 w-6 rounded-full bg-[#3BA4FF]/15 text-[#1D70B8] text-[9px] font-bold flex items-center justify-center">{(emp?.first_name || "?")[0]}</div>}
                                <span className="flex-1 text-xs text-[#334155] truncate">{emp ? `${emp.first_name} ${emp.last_name}` : pid}</span>
                                <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${stMeta.cls}`}>
                                  <stMeta.Icon className="h-2.5 w-2.5" /> {stMeta.l}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
