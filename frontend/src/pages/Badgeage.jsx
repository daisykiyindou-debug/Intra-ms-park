import { useEffect, useMemo, useState } from "react";
import { Fingerprint, AlertTriangle, Info, CreditCard, ShieldAlert, X, Calendar, MapPin, Phone, Play, Coffee, LogOut, LogIn, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import { api, formatDateFr, formatMinutes } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";

const anomalyMeta = {
  late: { label: "Retard léger", color: "#F59E0B", bg: "#FEF3C7" },
  missed_clock: { label: "Badge manquant", color: "#EF4444", bg: "#FEE2E2" },
  early_leave: { label: "Sortie anticipée", color: "#EF4444", bg: "#FEE2E2" },
  overtime: { label: "Heures sup.", color: "#3BA4FF", bg: "#E0F2FE" },
};

export default function Badgeage() {
  const { me } = useApp();
  const [range, setRange] = useState("month");
  const [statusFilter, setStatusFilter] = useState("all");
  const [data, setData] = useState([]);
  const [lostOpen, setLostOpen] = useState(false);
  const [lostForm, setLostForm] = useState({ reason: "", last_seen_location: "", contact_phone: "" });
  const [expanded, setExpanded] = useState(false);

  // Reset expansion on range change
  useEffect(() => { setExpanded(false); }, [range, statusFilter]);

  useEffect(() => {
    const load = () => api.get(`/badging?filter_range=${range}`).then((r) => setData(r.data));
    load();
    // Auto-refresh every minute so the live "today" entry stays in sync
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [range]);

  const filtered = useMemo(() => {
    // Live "today" entry is rendered in the hero card, hide it from the table
    const base = data.filter((d) => !d.live);
    if (statusFilter === "anomaly") return base.filter((d) => d.anomaly);
    if (statusFilter === "ok") return base.filter((d) => !d.anomaly);
    return base;
  }, [data, statusFilter]);

  const totalMins = data.filter((d) => !d.live).reduce((s, d) => s + (d.worked_minutes || 0), 0);
  const anomalies = data.filter((d) => d.anomaly && !d.live).length;
  const days = data.filter((d) => !d.live).length;

  const submitLost = async (e) => {
    e.preventDefault();
    await api.post("/badge/lost", lostForm);
    toast.success("Badge désactivé · demande RH transmise", {
      description: "Un nouveau badge vous sera remis sous 48h",
    });
    setLostOpen(false);
    setLostForm({ reason: "", last_seen_location: "", contact_phone: "" });
  };

  return (
    <div className="space-y-6 ms-fade-up">
      <div>
        <div className="ms-overline">Mon Coin RH</div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[#071B34] mt-1">Badge</h1>
        <p className="text-sm text-[#475569] mt-2 max-w-2xl">
          Informations de votre badge employé, historique de badgeage et anomalies.
        </p>
      </div>

      {/* Badge info card */}
      {me && (
        <div className="ms-card p-6 grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="md:col-span-2 rounded-2xl bg-gradient-to-br from-[#071B34] via-[#0B2545] to-[#071B34] text-white p-6 relative overflow-hidden ms-grain">
            <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-[#3BA4FF]/20 blur-3xl" />
            <div className="relative flex items-start justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-[#3BA4FF] font-semibold">
                  Badge MS Park
                </div>
                <div className="mt-1 font-mono text-3xl font-extrabold">{me.badge_number}</div>
              </div>
              <CreditCard className="h-8 w-8 text-white/40" />
            </div>
            <div className="relative mt-8 grid grid-cols-2 gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">
                  Titulaire
                </div>
                <div className="text-sm font-semibold">
                  {me.first_name} {me.last_name}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">
                  Expire le
                </div>
                <div className="text-sm font-semibold">
                  {new Date(me.badge_expiry).toLocaleDateString("fr-FR")}
                </div>
              </div>
            </div>
            <div className="relative mt-4">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                  me.badge_active ? "bg-[#10B981] text-white" : "bg-[#EF4444] text-white"
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                {me.badge_active ? "ACTIF" : "DÉSACTIVÉ"}
              </span>
            </div>
          </div>
          <div className="space-y-3">
            <button
              onClick={() => setLostOpen(true)}
              data-testid="lost-badge"
              className="ms-card ms-card-hover p-4 w-full text-left flex items-start gap-3 border border-[#EF4444]/20 bg-[#FEE2E2]/40 hover:border-[#EF4444]"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EF4444]/15 text-[#EF4444]">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-[#071B34]">J'ai perdu mon badge</div>
                <div className="text-xs text-[#475569]">Désactivation immédiate</div>
              </div>
            </button>
            <div className="ms-card p-4 flex items-start gap-3 bg-[#3BA4FF]/5 border border-[#3BA4FF]/15">
              <Info className="h-4 w-4 text-[#3BA4FF] mt-0.5" />
              <p className="text-xs text-[#475569]">
                Le badgeage est uniquement disponible sur site via votre badge physique.
                Aucun badgeage en ligne possible.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Live today — automatic badging based on planning */}
      <LiveTodayCard entry={data.find((d) => d.live)} />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Jours suivis" value={days} icon="📅" />
        <StatCard label="Temps travaillé" value={formatMinutes(totalMins)} icon="⏱️" />
        <StatCard label="Anomalies" value={anomalies} icon="⚠️" color="#EF4444" />
        <StatCard
          label="Conformité"
          value={`${days ? Math.round(((days - anomalies) / days) * 100) : 100}%`}
          icon="✓"
          color="#10B981"
        />
      </div>

      {/* Filters */}
      <div className="ms-card p-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl bg-[#F4F7FA] p-1">
          {[{ k: "day", l: "Jour" }, { k: "week", l: "Semaine" }, { k: "month", l: "Mois" }].map((o) => (
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
          {[{ k: "all", l: "Tous" }, { k: "ok", l: "Conformes" }, { k: "anomaly", l: "Anomalies" }].map((o) => (
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

      {/* Table with pause columns */}
      <div className="ms-card overflow-hidden">
        <div className="grid grid-cols-12 gap-3 px-5 py-3 border-b border-[#071B34]/5 text-[10px] uppercase tracking-wider font-semibold text-[#475569]">
          <div className="col-span-3">Date</div>
          <div className="col-span-1">Entrée</div>
          <div className="col-span-1">Début pause</div>
          <div className="col-span-1">Fin pause</div>
          <div className="col-span-1">Sortie</div>
          <div className="col-span-2">Travaillé</div>
          <div className="col-span-3 text-right">Statut</div>
        </div>
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-[#475569]">
            Aucun badgeage sur cette période.
          </div>
        ) : (
          <>
            {(expanded ? filtered : filtered.slice(0, 5)).map((b) => {
              const anom = b.anomaly ? anomalyMeta[b.anomaly] : null;
              return (
                <div
                  key={b.id}
                  className="grid grid-cols-12 gap-3 px-5 py-4 border-b border-[#071B34]/5 last:border-none items-center hover:bg-[#F4F7FA]/50 transition-colors text-sm"
                >
                  <div className="col-span-3">
                    <div className="font-semibold text-[#071B34]">{formatDateFr(b.day)}</div>
                    {b.note && <div className="text-[11px] text-[#475569]">{b.note}</div>}
                  </div>
                  <div className="col-span-1 font-mono text-[#071B34]">{b.clock_in || "—"}</div>
                  <div className="col-span-1 font-mono text-[#F59E0B]">{b.pause_out || "—"}</div>
                  <div className="col-span-1 font-mono text-[#F59E0B]">{b.pause_in || "—"}</div>
                  <div className="col-span-1 font-mono text-[#071B34]">{b.clock_out || "—"}</div>
                  <div className="col-span-2 font-semibold text-[#071B34]">
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
            })}
            {filtered.length > 5 && (
              <button
                onClick={() => setExpanded((v) => !v)}
                data-testid="badge-history-toggle"
                className="w-full py-3 text-xs font-semibold text-[#3BA4FF] hover:bg-[#3BA4FF]/5 transition-colors border-t border-[#071B34]/5"
              >
                {expanded
                  ? `↑ Réduire — afficher les 5 derniers jours`
                  : `↓ Voir plus (${filtered.length - 5} jour${filtered.length - 5 > 1 ? "s" : ""} supplémentaire${filtered.length - 5 > 1 ? "s" : ""})`}
              </button>
            )}
          </>
        )}
      </div>

      {/* Lost badge modal */}
      {lostOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setLostOpen(false)}
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-center justify-center p-4"
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={submitLost}
            data-testid="lost-form"
            className="ms-card max-w-lg w-full p-6"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#EF4444]/15 text-[#EF4444]">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div>
                  <div className="ms-overline">Badge perdu</div>
                  <h3 className="text-xl font-bold text-[#071B34]">Déclarer la perte de mon badge</h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLostOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[#071B34]/5"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 rounded-xl bg-[#FEE2E2]/40 p-3 text-xs text-[#B91C1C] border border-[#EF4444]/15">
              ⚠️ Votre badge sera <strong>immédiatement désactivé</strong>. Un ticket RH sera ouvert pour
              vous délivrer un nouveau badge sous 48h.
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="ms-overline">Circonstances</label>
                <textarea
                  required
                  rows={3}
                  value={lostForm.reason}
                  onChange={(e) => setLostForm({ ...lostForm, reason: e.target.value })}
                  data-testid="lost-reason"
                  placeholder="Décrivez la situation…"
                  className="ms-input mt-2 resize-none"
                />
              </div>
              <div>
                <label className="ms-overline">Dernier endroit où vous l'aviez</label>
                <input
                  value={lostForm.last_seen_location}
                  onChange={(e) =>
                    setLostForm({ ...lostForm, last_seen_location: e.target.value })
                  }
                  data-testid="lost-location"
                  placeholder="Ex. Vestiaire, Soccer Bar…"
                  className="ms-input mt-2"
                />
              </div>
              <div>
                <label className="ms-overline">Téléphone de contact</label>
                <input
                  type="tel"
                  value={lostForm.contact_phone}
                  onChange={(e) => setLostForm({ ...lostForm, contact_phone: e.target.value })}
                  placeholder={me?.phone}
                  className="ms-input mt-2"
                />
              </div>
            </div>

            <button
              type="submit"
              data-testid="submit-lost"
              className="ms-btn-primary w-full mt-5 !bg-[#EF4444] hover:!bg-[#B91C1C] shadow-[0_4px_14px_rgba(239,68,68,0.35)]"
            >
              Désactiver mon badge & déclarer la perte
            </button>
          </form>
        </div>
      )}
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
      <div
        className="mt-2 text-2xl font-bold tracking-tight"
        style={{ color: color || "#071B34" }}
      >
        {value}
      </div>
    </div>
  );
}

function LiveTodayCard({ entry }) {
  if (!entry) {
    return (
      <div className="ms-card p-5 border border-[#071B34]/5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F1F5F9] text-[#475569]">
            <Fingerprint className="h-5 w-5" />
          </div>
          <div>
            <div className="ms-overline text-[#475569]">Aujourd'hui</div>
            <h3 className="text-lg font-bold text-[#071B34] mt-0.5">Pas de service planifié</h3>
            <p className="text-xs text-[#475569] mt-1">
              Vous n'avez pas de shift programmé aujourd'hui.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const steps = [
    { key: "clock_in", label: "Badge d'entrée", value: entry.clock_in, icon: LogIn, color: "#10B981" },
    { key: "pause_out", label: "Sortie pause", value: entry.pause_out, icon: Coffee, color: "#F59E0B" },
    { key: "pause_in", label: "Reprise", value: entry.pause_in, icon: Play, color: "#3BA4FF" },
    { key: "clock_out", label: "Badge de sortie", value: entry.clock_out, icon: LogOut, color: "#7C3AED" },
  ];

  const completed = steps.filter((s) => s.value).length;
  const progressPct = entry.clock_out ? 100 : Math.round((completed / 4) * 100);

  const noteMeta = {
    "En attente": { color: "#475569", bg: "#F1F5F9" },
    "En service": { color: "#059669", bg: "#D1FAE5" },
    "En pause": { color: "#B45309", bg: "#FEF3C7" },
    "Reprise après pause": { color: "#1D70B8", bg: "#DBEAFE" },
    "Journée terminée": { color: "#6D28D9", bg: "#EDE9FE" },
  };
  const nm = noteMeta[entry.note] || noteMeta["En service"];

  return (
    <div
      className="ms-card p-6 border border-[#3BA4FF]/25 bg-gradient-to-br from-white to-[#3BA4FF]/5"
      data-testid="live-today-card"
    >
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#3BA4FF]/15 text-[#3BA4FF]">
            <Fingerprint className="h-5 w-5" />
          </div>
          <div>
            <div className="ms-overline text-[#3BA4FF]">Badgeage intelligent · Aujourd'hui</div>
            <h3 className="text-lg font-bold text-[#071B34] mt-0.5">
              Reconstitution automatique de la journée
            </h3>
            <p className="text-xs text-[#475569] mt-0.5">
              Basée sur votre planning — se complète au fur et à mesure de la journée.
            </p>
          </div>
        </div>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold"
          style={{ background: nm.bg, color: nm.color }}
          data-testid="live-status"
        >
          <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: nm.color }} />
          {entry.note}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mt-5">
        <div className="h-1.5 rounded-full bg-[#F1F5F9] overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#3BA4FF] to-[#1D70B8] transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* 4 steps */}
      <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
        {steps.map((s) => {
          const Icon = s.icon;
          const done = !!s.value;
          return (
            <div
              key={s.key}
              data-testid={`live-step-${s.key}`}
              className={`rounded-2xl p-4 border transition-all ${
                done
                  ? "bg-white border-[#071B34]/5 shadow-sm"
                  : "bg-[#F4F7FA]/60 border-dashed border-[#071B34]/10 opacity-60"
              }`}
            >
              <div className="flex items-center justify-between">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-xl"
                  style={{
                    background: done ? `${s.color}22` : "#F1F5F9",
                    color: done ? s.color : "#94A3B8",
                  }}
                >
                  <Icon className="h-4 w-4" />
                </div>
                {done && <CheckCircle2 className="h-4 w-4 text-[#10B981]" />}
              </div>
              <div className="ms-overline mt-3 text-[#475569]">{s.label}</div>
              <div
                className="mt-1 font-mono text-xl font-bold tracking-tight"
                style={{ color: done ? "#071B34" : "#94A3B8" }}
              >
                {s.value || "—:—"}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-[#475569] flex-wrap gap-2">
        <div className="inline-flex items-center gap-1.5">
          <Clock className="h-3 w-3" />
          Temps travaillé aujourd'hui : <strong className="text-[#071B34]">{formatMinutes(entry.worked_minutes || 0)}</strong>
        </div>
        <div className="text-[10px] uppercase tracking-wider">
          Mise à jour automatique toutes les minutes
        </div>
      </div>
    </div>
  );
}
