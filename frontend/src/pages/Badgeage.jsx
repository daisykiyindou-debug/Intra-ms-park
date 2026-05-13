import { useEffect, useMemo, useState } from "react";
import { Fingerprint, AlertTriangle, Clock, Info, ChevronDown } from "lucide-react";
import { api, formatDateFr, formatMinutes } from "@/lib/api";

const anomalyMeta = {
  late: { label: "Retard léger", color: "#F59E0B", bg: "#FEF3C7" },
  missed_clock: { label: "Badge manquant", color: "#EF4444", bg: "#FEE2E2" },
  early_leave: { label: "Sortie anticipée", color: "#EF4444", bg: "#FEE2E2" },
  overtime: { label: "Heures sup.", color: "#3BA4FF", bg: "#E0F2FE" },
};

export default function Badgeage() {
  const [range, setRange] = useState("month");
  const [statusFilter, setStatusFilter] = useState("all");
  const [data, setData] = useState([]);

  useEffect(() => {
    api.get(`/badging?filter_range=${range}`).then((r) => setData(r.data));
  }, [range]);

  const filtered = useMemo(() => {
    if (statusFilter === "anomaly") return data.filter((d) => d.anomaly);
    if (statusFilter === "ok") return data.filter((d) => !d.anomaly);
    return data;
  }, [data, statusFilter]);

  const totalMins = data.reduce((s, d) => s + (d.worked_minutes || 0), 0);
  const anomalies = data.filter((d) => d.anomaly).length;
  const days = data.length;

  return (
    <div className="space-y-6 ms-fade-up">
      <div>
        <div className="ms-overline">Mon Coin RH</div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[#071B34] mt-1">Badgeage & présence</h1>
        <p className="text-sm text-[#475569] mt-2 max-w-2xl">
          Consultez votre historique de badgeage et anomalies. Pour des questions, contactez votre manager.
        </p>
      </div>

      {/* Important banner */}
      <div className="ms-card p-5 flex items-start gap-4 bg-gradient-to-br from-[#3BA4FF]/8 to-transparent border border-[#3BA4FF]/15">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#3BA4FF]/15 text-[#3BA4FF]">
          <Fingerprint className="h-5 w-5" />
        </div>
        <div>
          <h4 className="text-base font-bold text-[#071B34]">Badgeage uniquement sur site</h4>
          <p className="text-sm text-[#475569] mt-1">
            Le badgeage est uniquement disponible sur site via votre badge employé MS Park. Aucun badgeage
            en ligne n'est possible. En cas d'oubli, prévenez immédiatement votre manager.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Jours suivis" value={days} icon="📅" />
        <StatCard label="Temps travaillé" value={formatMinutes(totalMins)} icon="⏱️" />
        <StatCard label="Anomalies" value={anomalies} icon="⚠️" color="#EF4444" />
        <StatCard label="Conformité" value={`${days ? Math.round(((days - anomalies) / days) * 100) : 100}%`} icon="✓" color="#10B981" />
      </div>

      {/* Filters */}
      <div className="ms-card p-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl bg-[#F4F7FA] p-1">
          {[
            { k: "day", l: "Jour" },
            { k: "week", l: "Semaine" },
            { k: "month", l: "Mois" },
          ].map((o) => (
            <button
              key={o.k}
              onClick={() => setRange(o.k)}
              data-testid={`range-${o.k}`}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                range === o.k ? "bg-[#071B34] text-white" : "text-[#475569]"
              }`}
            >
              {o.l}
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-xl bg-[#F4F7FA] p-1">
          {[
            { k: "all", l: "Tous" },
            { k: "ok", l: "Conformes" },
            { k: "anomaly", l: "Anomalies" },
          ].map((o) => (
            <button
              key={o.k}
              onClick={() => setStatusFilter(o.k)}
              data-testid={`filter-${o.k}`}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${
                statusFilter === o.k ? "bg-[#3BA4FF] text-white" : "text-[#475569]"
              }`}
            >
              {o.l}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="ms-card overflow-hidden">
        <div className="grid grid-cols-12 gap-3 px-5 py-3 border-b border-[#071B34]/5 text-[10px] uppercase tracking-wider font-semibold text-[#475569]">
          <div className="col-span-3">Date</div>
          <div className="col-span-2">Entrée</div>
          <div className="col-span-2">Sortie</div>
          <div className="col-span-2">Travaillé</div>
          <div className="col-span-3 text-right">Statut</div>
        </div>
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-[#475569]">Aucun badgeage sur cette période.</div>
        ) : (
          filtered.map((b) => {
            const anom = b.anomaly ? anomalyMeta[b.anomaly] : null;
            return (
              <div
                key={b.id}
                className="grid grid-cols-12 gap-3 px-5 py-4 border-b border-[#071B34]/5 last:border-none items-center hover:bg-[#F4F7FA]/50 transition-colors"
                data-testid={`row-${b.day}`}
              >
                <div className="col-span-3">
                  <div className="text-sm font-semibold text-[#071B34]">{formatDateFr(b.day)}</div>
                  {b.note && <div className="text-[11px] text-[#475569]">{b.note}</div>}
                </div>
                <div className="col-span-2 text-sm text-[#071B34] font-mono">{b.clock_in || "—"}</div>
                <div className="col-span-2 text-sm text-[#071B34] font-mono">{b.clock_out || "—"}</div>
                <div className="col-span-2 text-sm font-semibold text-[#071B34]">
                  {b.worked_minutes ? formatMinutes(b.worked_minutes) : "—"}
                </div>
                <div className="col-span-3 flex justify-end">
                  {anom ? (
                    <span className="ms-chip" style={{ background: anom.bg, color: anom.color }}>
                      <AlertTriangle className="h-3 w-3" /> {anom.label}
                    </span>
                  ) : (
                    <span className="ms-chip" style={{ background: "#D1FAE5", color: "#065F46" }}>
                      Conforme
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color }) {
  return (
    <div className="ms-card p-4">
      <div className="flex items-center justify-between">
        <span className="ms-overline">{label}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <div className="mt-2 text-2xl font-bold tracking-tight" style={{ color: color || "#071B34" }}>
        {value}
      </div>
    </div>
  );
}
