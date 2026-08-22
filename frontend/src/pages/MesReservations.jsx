import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Edit3, Trash2, Calendar } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

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
  const [tab, setTab] = useState("upcoming");
  const [items, setItems] = useState([]);

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
          {items.map((r) => (
            <div key={r.id} className="rounded-2xl ring-1 ring-[#071B34]/10 p-4 flex items-center gap-4" data-testid={`mine-res-${r.id}`}>
              {r.room_photo && <img src={r.room_photo} alt="" className="h-16 w-24 rounded-xl object-cover shrink-0" onError={(e) => { e.currentTarget.style.display = "none"; }} />}
              <div className="flex-1 min-w-0">
                <div className="text-base font-bold text-[#071B34] truncate">{r.title}</div>
                <div className="text-xs text-[#475569] mt-0.5">
                  <span className="font-semibold">{r.room_name}</span> · {formatDT(r.start_ts)} – {formatTime(r.end_ts)}
                  {r.status === "cancelled" && <span className="ml-2 text-red-600 font-semibold">· Annulée</span>}
                </div>
              </div>
              {r.status !== "cancelled" && new Date(r.end_ts) >= new Date() && (
                <div className="flex items-center gap-1">
                  <Link
                    to={`/salles/${r.room_id}/reserver`}
                    title="Modifier"
                    className="h-9 w-9 rounded-lg hover:bg-[#F4F7FA] inline-flex items-center justify-center text-[#3BA4FF]"
                    data-testid={`mine-edit-${r.id}`}
                  >
                    <Edit3 className="h-4 w-4" />
                  </Link>
                  <button
                    onClick={() => cancel(r)}
                    title="Annuler"
                    className="h-9 w-9 rounded-lg hover:bg-[#FEE2E2] inline-flex items-center justify-center text-[#B91C1C]"
                    data-testid={`mine-cancel-${r.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
