import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";
import { api } from "@/lib/api";

/**
 * Interactive month calendar for leave / RTT / absence requests.
 *
 * Props:
 *  - value: string[] — currently selected ISO days
 *  - onChange: (dates: string[]) => void
 *  - initialMonth?: "YYYY-MM"
 */
const STATUS_STYLES = {
  available: { bg: "bg-white", border: "border-[#071B34]/10", text: "text-[#071B34]", label: "Disponible" },
  worked: { bg: "bg-[#3BA4FF]/10", border: "border-[#3BA4FF]/30", text: "text-[#1D70B8]", label: "Travail" },
  off: { bg: "bg-[#F4F7FA]", border: "border-[#071B34]/8", text: "text-[#94A3B8] line-through", label: "OFF" },
  cp_approved: { bg: "bg-[#10B981]/15", border: "border-[#10B981]/40", text: "text-[#047857]", label: "CP validé" },
  rtt_approved: { bg: "bg-[#F59E0B]/15", border: "border-[#F59E0B]/40", text: "text-[#B45309]", label: "RTT validé" },
  pending: { bg: "bg-[#A78BFA]/15", border: "border-[#A78BFA]/40", text: "text-[#6D28D9]", label: "En attente" },
  holiday: { bg: "bg-[#EF4444]/10", border: "border-[#EF4444]/30", text: "text-[#B91C1C]", label: "Férié" },
  past: { bg: "bg-[#F4F7FA]", border: "border-transparent", text: "text-[#CBD5E1]", label: "Passé" },
};

const MONTHS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

function ymOf(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
function todayYm() { return ymOf(new Date()); }

export default function LeaveCalendar({ value = [], onChange, initialMonth, readOnly = false }) {
  const [month, setMonth] = useState(initialMonth || todayYm());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const selected = useMemo(() => new Set(value), [value]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    api.get(`/availability?month=${month}`)
      .then((r) => { if (live) setData(r.data); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [month]);

  const toggle = (day) => {
    if (readOnly) return;
    if (!day.selectable) return;
    const next = new Set(selected);
    if (next.has(day.date)) next.delete(day.date);
    else next.add(day.date);
    onChange(Array.from(next).sort());
  };

  const changeMonth = (delta) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(ymOf(d));
  };

  // Build 6-week grid with leading blanks
  const grid = useMemo(() => {
    if (!data) return [];
    const first = new Date(`${data.month}-01T00:00:00`);
    const firstDow = (first.getDay() + 6) % 7; // Mon=0 … Sun=6
    const cells = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (const day of data.days) cells.push(day);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [data]);

  const [y, m] = month.split("-").map(Number);

  return (
    <div className={`rounded-2xl border border-[#071B34]/8 bg-white p-4 md:p-5 ${readOnly ? "opacity-60 pointer-events-none select-none" : ""}`} data-testid="leave-calendar" aria-disabled={readOnly}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => changeMonth(-1)}
          data-testid="cal-prev"
          className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[#071B34]/5"
          aria-label="Mois précédent"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-base md:text-lg font-bold text-[#071B34]">
          {MONTHS_FR[m - 1]} {y}
        </div>
        <button
          type="button"
          onClick={() => changeMonth(1)}
          data-testid="cal-next"
          className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[#071B34]/5"
          aria-label="Mois suivant"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#94A3B8] mb-1.5">
        {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
          <div key={i} className="text-center">{d}</div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-1.5" data-testid="cal-grid">
        {loading && grid.length === 0 && (
          <div className="col-span-7 text-center text-xs text-[#475569] py-8">Chargement…</div>
        )}
        {grid.map((day, idx) => {
          if (!day) return <div key={`b-${idx}`} className="aspect-square" />;
          const style = STATUS_STYLES[day.status] || STATUS_STYLES.available;
          const isSelected = selected.has(day.date);
          const dayNum = parseInt(day.date.slice(-2), 10);
          return (
            <button
              key={day.date}
              type="button"
              onClick={() => toggle(day)}
              disabled={!day.selectable}
              data-testid={`day-${day.date}`}
              data-status={day.status}
              data-selected={isSelected ? "true" : "false"}
              title={day.label}
              className={`aspect-square rounded-lg border text-center transition-all relative flex flex-col items-center justify-center ${
                isSelected
                  ? "border-[#3BA4FF] bg-[#3BA4FF]/20 ring-2 ring-[#3BA4FF] text-[#1D70B8] font-bold shadow-md"
                  : `${style.bg} ${style.border} ${style.text} ${day.selectable ? "hover:shadow-md hover:border-[#3BA4FF]/60 cursor-pointer" : "cursor-not-allowed opacity-80"}`
              }`}
            >
              <span className="text-sm font-semibold leading-none">{dayNum}</span>
              {day.status !== "available" && day.status !== "past" && (
                <span className={`text-[8px] uppercase tracking-wide mt-0.5 leading-none ${isSelected ? "text-[#1D70B8]" : ""}`}>
                  {STATUS_STYLES[day.status]?.label}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 pt-3 border-t border-[#071B34]/5 flex flex-wrap gap-x-3 gap-y-1.5 text-[10px]">
        {[
          ["available", "Disponible"],
          ["worked", "Travail"],
          ["off", "OFF"],
          ["cp_approved", "CP validé"],
          ["rtt_approved", "RTT validé"],
          ["pending", "En attente"],
          ["holiday", "Férié"],
        ].map(([k, l]) => (
          <div key={k} className="flex items-center gap-1 text-[#475569]">
            <span className={`inline-block h-2.5 w-2.5 rounded-sm border ${STATUS_STYLES[k].bg} ${STATUS_STYLES[k].border}`} />
            {l}
          </div>
        ))}
      </div>

      {/* Summary */}
      <div className="mt-3 flex items-start gap-2 text-xs text-[#475569] bg-[#3BA4FF]/5 rounded-lg p-2.5">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-[#3BA4FF]" />
        <div>
          Cliquez sur les journées que vous souhaitez poser. Vous pouvez sélectionner plusieurs jours <strong>non consécutifs</strong>.
          Les jours OFF, fériés, déjà validés ou en attente sont automatiquement bloqués.
          {value.length > 0 && (
            <div className="mt-1 text-[#071B34] font-semibold">
              {value.length} jour{value.length > 1 ? "s" : ""} sélectionné{value.length > 1 ? "s" : ""}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
