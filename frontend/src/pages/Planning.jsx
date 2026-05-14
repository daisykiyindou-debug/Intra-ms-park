import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Clock, MapPin, User, X, CalendarClock } from "lucide-react";
import { api, fr, formatDateFr } from "@/lib/api";

const typeStyles = {
  shift: { bg: "#3BA4FF15", color: "#1D70B8", label: "Shift" },
  off: { bg: "#F1F5F9", color: "#64748B", label: "OFF" },
  leave: { bg: "#EDE9FE", color: "#7C3AED", label: "Congé" },
  training: { bg: "#FEF3C7", color: "#B45309", label: "Formation" },
  meeting: { bg: "#FCE7F3", color: "#BE185D", label: "Réunion" },
};

export default function Planning() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [month, setMonth] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [view, setView] = useState("month");
  const [data, setData] = useState([]);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const ym = `${month.y}-${String(month.m + 1).padStart(2, "0")}`;
    api.get(`/schedule?month=${ym}`).then((r) => setData(r.data));
  }, [month]);

  const grid = useMemo(() => {
    const first = new Date(month.y, month.m, 1);
    const last = new Date(month.y, month.m + 1, 0);
    const offset = (first.getDay() + 6) % 7;
    const days = [];
    for (let i = 0; i < offset; i++) {
      const d = new Date(month.y, month.m, -offset + i + 1);
      days.push({ date: d, outside: true });
    }
    for (let i = 1; i <= last.getDate(); i++) {
      days.push({ date: new Date(month.y, month.m, i), outside: false });
    }
    while (days.length % 7 !== 0) {
      const d = new Date(month.y, month.m + 1, days.length - last.getDate() - offset + 1);
      days.push({ date: d, outside: true });
    }
    return days;
  }, [month]);

  const byDay = useMemo(() => Object.fromEntries(data.map((s) => [s.day, s])), [data]);
  const iso = (d) => d.toISOString().slice(0, 10);

  const monthMins = useMemo(() => {
    let mins = 0;
    data.forEach((s) => {
      if (s.type === "shift" && s.start && s.end) {
        const [sh, sm] = s.start.split(":").map(Number);
        const [eh, em] = s.end.split(":").map(Number);
        mins += eh * 60 + em - sh * 60 - sm - s.break_minutes;
      }
    });
    return mins;
  }, [data]);

  // Find next upcoming shift
  const todayIso = iso(today);
  const nextShift = useMemo(() => {
    return data.find((s) => s.day >= todayIso && s.type === "shift");
  }, [data, todayIso]);

  const monthLabel = `${fr.months[month.m].charAt(0).toUpperCase() + fr.months[month.m].slice(1)} ${month.y}`;
  const prev = () => setMonth((p) => (p.m === 0 ? { y: p.y - 1, m: 11 } : { y: p.y, m: p.m - 1 }));
  const next = () => setMonth((p) => (p.m === 11 ? { y: p.y + 1, m: 0 } : { y: p.y, m: p.m + 1 }));

  const weekDays = useMemo(() => {
    const start = new Date(today);
    start.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatPause = (s) => {
    if (!s.start || !s.pause_start) return `${s.start} – ${s.end}`;
    return `${s.start}–${s.pause_start} / ${s.pause_end}–${s.end}`;
  };

  return (
    <div className="space-y-6 ms-fade-up">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <div className="ms-overline">Mon Coin RH</div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[#071B34] mt-1">Mon planning</h1>
          <p className="text-sm text-[#475569] mt-2">
            Contrat 24h/semaine · 45 min de pause par shift · Mer → Dim
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 justify-end">
        <div className="inline-flex rounded-xl bg-white border border-[#071B34]/8 p-1">
          <button
            onClick={() => setView("month")}
            data-testid="view-month"
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${
              view === "month" ? "bg-[#071B34] text-white" : "text-[#475569]"
            }`}
          >
            Mois
          </button>
          <button
            onClick={() => setView("week")}
            data-testid="view-week"
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${
              view === "week" ? "bg-[#071B34] text-white" : "text-[#475569]"
            }`}
          >
            Semaine
          </button>
        </div>
      </div>

      <div className="ms-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-[#071B34]">{monthLabel}</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#475569]">
              <strong className="text-[#071B34]">
                {Math.floor(monthMins / 60)}h{String(monthMins % 60).padStart(2, "0")}
              </strong>{" "}
              ce mois
            </span>
            <button onClick={prev} className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[#071B34]/5">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button onClick={next} className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[#071B34]/5">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {view === "month" ? (
          <>
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
                const entry = byDay[k];
                const t = entry?.type || null;
                const meta = t ? typeStyles[t] : null;
                const isToday = k === todayIso;
                const isPast = date < today;
                return (
                  <button
                    key={i}
                    data-testid={`day-${k}`}
                    onClick={() => entry && setSelected(entry)}
                    disabled={!entry}
                    className={`group relative min-h-[100px] rounded-xl border border-[#071B34]/5 p-2 text-left transition-all ${
                      outside ? "opacity-30" : ""
                    } ${isToday ? "ring-2 ring-[#3BA4FF]" : ""} ${
                      isPast && !outside ? "opacity-60 bg-[#F4F7FA]" : "bg-white hover:border-[#3BA4FF]/40 hover:shadow-md"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={`text-sm font-semibold ${
                          isToday ? "text-[#3BA4FF]" : isPast ? "text-[#94A3B8]" : "text-[#071B34]"
                        }`}
                      >
                        {date.getDate()}
                      </span>
                      {entry && meta && (
                        <span
                          className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                          style={{ background: meta.bg, color: meta.color }}
                        >
                          {meta.label}
                        </span>
                      )}
                    </div>
                    {entry && entry.start ? (
                      <>
                        <div className="text-[10px] font-semibold text-[#071B34] leading-tight">
                          {formatPause(entry)}
                        </div>
                        <div className="text-[10px] text-[#475569] truncate mt-0.5">
                          {entry.service || entry.note || ""}
                        </div>
                      </>
                    ) : !entry && !outside ? (
                      <div className="text-[10px] text-[#94A3B8] italic mt-1">
                        Planning en attente
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-7 gap-3">
            {weekDays.map((d) => {
              const k = iso(d);
              const entry = byDay[k];
              const t = entry?.type || null;
              const meta = t ? typeStyles[t] : null;
              const isToday = k === todayIso;
              const isPast = d < today;
              return (
                <button
                  key={k}
                  onClick={() => entry && setSelected(entry)}
                  className={`ms-card p-4 text-left h-40 ${isToday ? "ring-2 ring-[#3BA4FF]" : ""} ${
                    isPast ? "opacity-60" : ""
                  }`}
                >
                  <div className="text-[10px] uppercase tracking-wider text-[#475569] font-semibold">
                    {fr.daysShort[(d.getDay() + 6) % 7]} {d.getDate()}
                  </div>
                  <div className="mt-2">
                    {entry?.start ? (
                      <>
                        <div className="text-sm font-bold text-[#071B34] leading-tight">
                          {formatPause(entry)}
                        </div>
                        <div className="text-xs text-[#475569] mt-1">{entry.service}</div>
                      </>
                    ) : entry ? (
                      <div className="text-sm text-[#475569]">{meta.label}</div>
                    ) : (
                      <div className="text-xs text-[#94A3B8] italic">Planning en attente de délivrance</div>
                    )}
                  </div>
                  {meta && (
                    <span
                      className="ms-chip mt-3 inline-flex"
                      style={{ background: meta.bg, color: meta.color }}
                    >
                      {meta.label}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-3 text-xs text-[#475569]">
          {Object.entries(typeStyles).map(([k, v]) => (
            <div key={k} className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: v.color }} />
              {v.label}
            </div>
          ))}
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#94A3B8]" />
            Jour passé
          </div>
        </div>
      </div>

      {selected && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setSelected(null)}
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-center justify-center p-6"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="ms-card max-w-md w-full p-6"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="ms-overline">{typeStyles[selected.type]?.label}</div>
                <h3 className="text-2xl font-bold text-[#071B34] mt-1">{formatDateFr(selected.day)}</h3>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[#071B34]/5"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {selected.type === "shift" ? (
              <div className="mt-4 space-y-3">
                <Detail icon={Clock} label="Horaires">
                  <strong>
                    {selected.start}–{selected.pause_start} / {selected.pause_end}–{selected.end}
                  </strong>
                  <br />
                  Pause {selected.break_minutes}min de {selected.pause_start} à {selected.pause_end}
                </Detail>
                <Detail icon={MapPin} label="Lieu de poste">{selected.location}</Detail>
                <Detail icon={User} label="Manager référent">{selected.manager}</Detail>
                <Detail icon={MapPin} label="Service">{selected.service}</Detail>
              </div>
            ) : (
              <p className="mt-4 text-sm text-[#475569]">{selected.note || "—"}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-[#F4F7FA] p-3">
      <Icon className="h-4 w-4 text-[#3BA4FF] mt-0.5" />
      <div>
        <div className="text-[10px] uppercase tracking-wider text-[#475569] font-semibold">{label}</div>
        <div className="text-sm text-[#071B34] mt-0.5">{children}</div>
      </div>
    </div>
  );
}
