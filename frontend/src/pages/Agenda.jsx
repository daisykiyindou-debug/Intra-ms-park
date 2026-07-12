import { useEffect, useMemo, useState } from "react";
import { Calendar as CalIcon, ChevronLeft, ChevronRight, MapPin, Clock, X, ExternalLink, Users } from "lucide-react";
import { api, fr, formatDateFr } from "@/lib/api";

const typeColor = {
  event: { bg: "#A78BFA22", color: "#7C3AED", label: "Événement" },
  training: { bg: "#FEF3C7", color: "#B45309", label: "Formation" },
  meeting: { bg: "#3BA4FF22", color: "#1D70B8", label: "Réunion" },
  birthday: { bg: "#FCE7F3", color: "#BE185D", label: "Anniversaire" },
  maintenance: { bg: "#F1F5F9", color: "#475569", label: "Maintenance" },
};

export default function Agenda() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [month, setMonth] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [events, setEvents] = useState([]);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    api.get("/events").then((r) => setEvents(r.data));
  }, []);

  const grid = useMemo(() => {
    const first = new Date(month.y, month.m, 1);
    const last = new Date(month.y, month.m + 1, 0);
    const offset = (first.getDay() + 6) % 7;
    const days = [];
    for (let i = 0; i < offset; i++) {
      days.push({ outside: true, date: new Date(month.y, month.m, -offset + i + 1) });
    }
    for (let i = 1; i <= last.getDate(); i++) {
      days.push({ date: new Date(month.y, month.m, i), outside: false });
    }
    return days;
  }, [month]);

  const byDay = useMemo(() => {
    const map = {};
    events.forEach((e) => {
      (map[e.date] = map[e.date] || []).push(e);
    });
    return map;
  }, [events]);

  const iso = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const todayIso = iso(today);

  return (
    <div className="space-y-6 ms-fade-up">
      <div>
        <div className="ms-overline">Entreprise</div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[#071B34] mt-1">Agenda</h1>
        <p className="text-sm text-[#475569] mt-2">
          Événements, formations, réunions et temps forts du parc. Cliquez sur un événement pour les détails.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 ms-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-[#071B34]">
              {fr.months[month.m].charAt(0).toUpperCase() + fr.months[month.m].slice(1)} {month.y}
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMonth((p) => (p.m === 0 ? { y: p.y - 1, m: 11 } : { y: p.y, m: p.m - 1 }))}
                className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[#071B34]/5"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setMonth((p) => (p.m === 11 ? { y: p.y + 1, m: 0 } : { y: p.y, m: p.m + 1 }))}
                className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[#071B34]/5"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-2 text-center mb-2">
            {fr.daysShort.map((d) => (
              <div key={d} className="text-xs font-semibold text-[#475569] uppercase tracking-wider">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {grid.map(({ date, outside }, i) => {
              const k = iso(date);
              const ev = byDay[k] || [];
              const isToday = k === todayIso;
              const isPast = date < today;
              return (
                <div
                  key={i}
                  className={`min-h-[90px] rounded-xl border border-[#071B34]/5 p-2 ${
                    outside ? "opacity-30" : isPast ? "bg-[#F4F7FA] opacity-60" : "bg-white"
                  } ${isToday ? "ring-2 ring-[#3BA4FF]" : ""}`}
                >
                  <div
                    className={`text-sm font-semibold ${
                      isToday ? "text-[#3BA4FF]" : isPast ? "text-[#94A3B8]" : "text-[#071B34]"
                    }`}
                  >
                    {date.getDate()}
                  </div>
                  <div className="mt-1 space-y-1">
                    {ev.slice(0, 2).map((e) => {
                      const m = typeColor[e.type];
                      return (
                        <button
                          key={e.id}
                          onClick={() => setSelected(e)}
                          data-testid={`event-cell-${e.id}`}
                          className="block w-full text-left text-[10px] truncate rounded px-1.5 py-0.5 hover:opacity-80 transition-opacity"
                          style={{ background: m.bg, color: m.color }}
                          title={e.title}
                        >
                          {e.title}
                        </button>
                      );
                    })}
                    {ev.length > 2 && (
                      <div className="text-[10px] text-[#475569] font-semibold">+{ev.length - 2}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-4 ms-card p-5">
          <h3 className="text-lg font-bold text-[#071B34]">Prochains événements</h3>
          <div className="mt-4 space-y-3">
            {events
              .filter((e) => new Date(e.date) >= today)
              .slice(0, 8)
              .map((e) => {
                const m = typeColor[e.type];
                return (
                  <button
                    key={e.id}
                    onClick={() => setSelected(e)}
                    data-testid={`event-${e.id}`}
                    className="w-full text-left flex gap-3 rounded-xl hover:bg-[#F4F7FA] p-2 transition-colors"
                  >
                    <div
                      className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl"
                      style={{ background: m.bg, color: m.color }}
                    >
                      <CalIcon className="h-3.5 w-3.5" />
                      <div className="text-[10px] font-bold mt-0.5">{new Date(e.date).getDate()}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-[#071B34] line-clamp-1">{e.title}</div>
                      <div className="text-[11px] text-[#475569] mt-0.5">
                        <Clock className="inline h-3 w-3 mr-1" /> {e.time} · {e.location}
                      </div>
                    </div>
                  </button>
                );
              })}
          </div>
        </div>
      </div>

      {/* Event modal */}
      {selected && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setSelected(null)}
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            data-testid="event-modal"
            className="ms-card max-w-lg w-full p-6"
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <span
                  className="ms-chip"
                  style={{
                    background: typeColor[selected.type].bg,
                    color: typeColor[selected.type].color,
                  }}
                >
                  {typeColor[selected.type].label}
                </span>
                <h3 className="mt-2 text-2xl font-bold text-[#071B34]">{selected.title}</h3>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[#071B34]/5"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <Info icon={CalIcon} label="Date">
                {formatDateFr(selected.date)}
              </Info>
              <Info icon={Clock} label="Heure">{selected.time}</Info>
              <Info icon={MapPin} label="Lieu">{selected.location}</Info>
            </div>

            <p className="text-sm text-[#475569] leading-relaxed">{selected.description}</p>

            <div className="mt-5 flex flex-col sm:flex-row gap-2">
              {selected.needs_registration ? (
                <a
                  href={`mailto:rh@mspark.fr?subject=Inscription : ${encodeURIComponent(selected.title)}`}
                  data-testid="event-register"
                  className="ms-btn-primary flex-1"
                >
                  <Users className="h-4 w-4" /> S'inscrire à cet événement
                </a>
              ) : (
                <div className="flex-1 rounded-xl bg-[#F4F7FA] px-4 py-2.5 text-xs text-[#475569] text-center">
                  Aucune inscription requise
                </div>
              )}
              <button
                onClick={() => setSelected(null)}
                className="ms-btn-outline"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Info({ icon: Icon, label, children }) {
  return (
    <div className="rounded-xl bg-[#F4F7FA] p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-[#475569]">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="text-sm font-semibold text-[#071B34] mt-1">{children}</div>
    </div>
  );
}
