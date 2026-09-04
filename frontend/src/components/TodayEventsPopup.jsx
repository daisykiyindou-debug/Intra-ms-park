import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Calendar, MapPin, Clock, X, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";

/**
 * Once per day, on the first connection, remind the user of every event
 * scheduled today (from `/api/events` — which also includes room
 * reservations they organize or are invited to since iter 62).
 * Persisted via localStorage so it does not reappear until the next day.
 */
export default function TodayEventsPopup() {
  const { me } = useApp();
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!me?.id) return;
    if (me.needs_welcome || me.needs_tour) return; // Wait for onboarding
    const today = new Date().toISOString().slice(0, 10);
    const seenKey = `ms-events-popup-${me.id}-${today}`;
    if (localStorage.getItem(seenKey)) return;
    let ignore = false;
    (async () => {
      try {
        const { data } = await api.get("/events");
        if (ignore || !Array.isArray(data)) return;
        const todays = data
          .filter((e) => e && e.date === today)
          .sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""));
        if (todays.length > 0) {
          setEvents(todays);
          setOpen(true);
        } else {
          // Still record so we don't refetch on every render this day
          localStorage.setItem(seenKey, "1");
        }
      } catch (_e) { /* silent — background reminder */ }
    })();
    return () => { ignore = true; };
  }, [me?.id, me?.needs_welcome, me?.needs_tour]);

  const dismiss = () => {
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem(`ms-events-popup-${me?.id}-${today}`, "1");
    setOpen(false);
  };

  const goAgenda = () => {
    dismiss();
    navigate("/agenda");
  };

  if (!open || events.length === 0) return null;

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" data-testid="today-events-popup">
      <div className="absolute inset-0 bg-[#071B34]/70 backdrop-blur-md" onClick={dismiss} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-br from-[#3BA4FF] to-[#1D70B8] text-white px-6 pt-5 pb-6 relative">
          <button
            onClick={dismiss}
            data-testid="today-events-close"
            className="absolute top-3 right-3 h-8 w-8 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 transition-colors"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-start gap-3">
            <div className="h-11 w-11 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center shrink-0">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/70">Rappel du jour</div>
              <h3 className="text-lg font-extrabold leading-tight mt-1">
                Vous avez {events.length > 1 ? `${events.length} événements` : "un événement"} aujourd&apos;hui&nbsp;!
              </h3>
            </div>
          </div>
        </div>

        {/* Events list */}
        <div className="px-6 py-4 max-h-[50vh] overflow-y-auto">
          <ul className="space-y-3">
            {events.map((e) => (
              <li
                key={e.id}
                data-testid={`today-event-${e.id}`}
                className="rounded-2xl bg-[#F8FAFC] p-4 border border-[#071B34]/5"
              >
                <div className="font-bold text-[#071B34] text-sm">{e.title}</div>
                {(e.start_time || e.end_time) && (
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-[#475569]">
                    <Clock className="h-3.5 w-3.5 text-[#3BA4FF]" />
                    {e.start_time || "—"}{e.end_time ? ` – ${e.end_time}` : ""}
                  </div>
                )}
                {e.location && (
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[#475569]">
                    <MapPin className="h-3.5 w-3.5 text-[#F59E0B]" />
                    {e.location}
                  </div>
                )}
                {e.description && (
                  <div className="mt-2 text-xs text-[#334155] leading-relaxed line-clamp-2">
                    {e.description}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* Actions */}
        <div className="flex gap-2 px-6 pb-6">
          <button
            onClick={dismiss}
            data-testid="today-events-ignore"
            className="flex-1 rounded-xl bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#334155] text-sm font-semibold py-2.5 transition-colors"
          >
            Ignorer
          </button>
          <button
            onClick={goAgenda}
            data-testid="today-events-open-agenda"
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#3BA4FF] hover:bg-[#1D70B8] text-white text-sm font-semibold py-2.5 transition-colors"
          >
            Voir dans mon agenda <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
