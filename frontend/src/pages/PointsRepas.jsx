import { useEffect, useMemo, useState } from "react";
import { Wallet, Clock, ShoppingBag, BadgeCheck, Info, ListChecks, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { api, roleQuotaLabel, fr } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";

const POSTE_GROUPS = [
  {
    key: "employe",
    title: "Employés",
    color: "#3BA4FF",
    pts: 20,
    roles: ["Polyvalent", "Op. Karting", "Op. Attractions", "Sécurité", "Nettoyage"],
  },
  {
    key: "restauration",
    title: "Restauration",
    color: "#A78BFA",
    pts: 30,
    roles: ["Barman", "Serveur", "Cuisinier", "Chef de partie", "Aide cuisine", "Donut House"],
  },
  {
    key: "encadrement",
    title: "Encadrement",
    color: "#F59E0B",
    pts: 35,
    roles: ["Managers", "Resp. Cuisine", "Resp. Soccer Bar", "Resp. Donut House", "Resp. Opérations"],
  },
];

export default function PointsRepas() {
  const { me } = useApp();
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    const load = () => {
      api.get("/meal-points/today").then((r) => setData(r.data));
      api.get("/meal-points/history").then((r) => setHistory(r.data));
    };
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  const repartition = useMemo(() => {
    if (!data) return [];
    const map = {};
    data.transactions.forEach((t) => {
      map[t.location] = (map[t.location] || 0) + t.points_spent;
    });
    const total = Object.values(map).reduce((s, v) => s + v, 0) || 1;
    const NAMES = {
      soccer_bar: "Soccer Bar",
      donut_house: "Donut House",
      stand_crepes: "Stand Crêpes",
      stand_bonbons: "Stand Bonbons",
    };
    return Object.entries(map).map(([k, v]) => ({
      name: NAMES[k] || k,
      value: v,
      pct: Math.round((v / total) * 100),
    }));
  }, [data]);

  if (!data || !me) return <div className="ms-card p-8 animate-pulse h-64" />;

  const { daily_quota, credited_points, used, remaining } = data;
  const dailyPct = daily_quota ? Math.round((used / daily_quota) * 100) : 0;
  const remainingPct = 100 - dailyPct;

  return (
    <div className="space-y-6 ms-fade-up">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <div className="ms-overline">Crédit repas employé</div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[#071B34] mt-1">
            Points Repas MS Park
          </h1>
          <p className="mt-2 text-sm text-[#475569] max-w-2xl">
            Crédits journaliers utilisables uniquement dans les espaces de restauration MS Park. Liés à votre badge,
            valables le jour même, non cumulables, non transférables.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-[#10B981]/12 px-4 py-2 text-sm font-semibold text-[#065F46]">
          <BadgeCheck className="h-4 w-4" />
          Badge {me.badge_number} {me.badge_active ? "actif" : "désactivé"}
        </div>
      </div>

      {/* Main row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Solde du jour card */}
        <div className="lg:col-span-8 ms-card p-7">
          <div className="flex items-start justify-between mb-2">
            <span className="ms-overline">Solde du jour</span>
            <span
              className="ms-chip"
              style={{ background: "#3BA4FF20", color: "#1D70B8" }}
            >
              {roleQuotaLabel(me.role_category).toUpperCase()}
            </span>
          </div>
          <div className="flex items-baseline gap-3">
            <span className="text-7xl font-extrabold tracking-tighter text-[#071B34]">
              {remaining}
            </span>
            <span className="text-2xl text-[#475569] font-light">/ {credited_points || daily_quota} pts restants</span>
          </div>
          <div className="mt-3 text-sm text-[#475569]">
            Poste : <strong className="text-[#071B34]">{me.role}</strong>
          </div>

          <div className="mt-8">
            <div className="flex justify-between text-xs text-[#475569] mb-1.5">
              <span>{used} pts dépensés</span>
              <span>{remainingPct}% restant</span>
            </div>
            <div className="h-3 w-full rounded-full bg-[#F1F5F9] overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#3BA4FF] to-[#1D70B8] transition-all duration-700"
                style={{ width: `${dailyPct}%` }}
              />
            </div>
          </div>

          <div className="mt-7 pt-6 border-t border-[#071B34]/5 grid grid-cols-3 gap-6">
            <Stat icon={Wallet} label="Quota journalier" value={`${daily_quota} pts`} color="#071B34" />
            <Stat icon={ShoppingBag} label="Dépensés aujourd'hui" value={`${used} pts`} color="#071B34" />
            <Stat icon={Clock} label="Restants" value={`${remaining} pts`} color="#3BA4FF" />
          </div>

          <div className="mt-6">
            <Link to="/restaurant" className="ms-btn-primary">
              <ShoppingBag className="h-4 w-4" />
              Commander un repas
            </Link>
          </div>
        </div>

        {/* Right column: status + répartition */}
        <div className="lg:col-span-4 space-y-4">
          <div className="ms-card p-5">
            <div className="flex items-center justify-between">
              <span className="ms-overline">Badge</span>
              <span className="ms-chip" style={{ background: "#D1FAE5", color: "#065F46" }}>
                ● Actif
              </span>
            </div>
            <div className="mt-3 font-mono text-2xl font-bold text-[#071B34]">{me.badge_number}</div>
            <div className="text-xs text-[#475569] mt-1">
              Expire le{" "}
              <strong className="text-[#071B34]">
                {new Date(me.badge_expiry).toLocaleDateString("fr-FR")}
              </strong>
            </div>
            <Link
              to="/rh/badgeage"
              className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[#3BA4FF] hover:underline"
            >
              Gérer mon badge →
            </Link>
          </div>

          <div className="ms-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-base font-bold text-[#071B34]">Répartition</h4>
              <TrendingUp className="h-4 w-4 text-[#475569]/40" />
            </div>
            {repartition.length === 0 ? (
              <div className="text-xs text-[#475569] py-6 text-center">
                Aucune dépense aujourd'hui
              </div>
            ) : (
              <div className="space-y-3">
                {repartition.map((r) => (
                  <div key={r.name}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-semibold text-[#071B34]">{r.name}</span>
                      <span className="text-[#475569]">{r.pct}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-[#F1F5F9] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#3BA4FF] to-[#1D70B8]"
                        style={{ width: `${r.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Historique + Consommation 7 jours */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 ms-card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ListChecks className="h-5 w-5 text-[#3BA4FF]" />
              <h3 className="text-lg font-bold text-[#071B34]">Historique du jour</h3>
            </div>
            <span className="text-xs text-[#475569]">{data.transactions.length} transactions</span>
          </div>
          {data.transactions.length === 0 ? (
            <div className="py-10 text-center">
              <ShoppingBag className="mx-auto h-10 w-10 text-[#3BA4FF]/40" />
              <p className="mt-3 text-sm text-[#475569]">Aucun achat aujourd'hui.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {data.transactions.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-3 rounded-2xl border border-[#071B34]/5 p-3"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#3BA4FF]/10">
                    <Clock className="h-4 w-4 text-[#3BA4FF]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-[#071B34] truncate">
                      {t.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}
                    </div>
                    <div className="text-xs text-[#475569]">
                      {t.location.replace("_", " ")} ·{" "}
                      {new Date(t.ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  <div className="text-right text-sm font-bold text-[#071B34]">-{t.points_spent} pts</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-5 ms-card p-6">
          <h3 className="text-lg font-bold text-[#071B34]">Consommation 7 jours</h3>
          <p className="text-xs text-[#475569] mt-1">Points dépensés par jour</p>
          <div className="mt-6 flex items-end justify-between h-40 gap-2">
            {history.map((h) => {
              const d = new Date(h.date);
              const max = Math.max(...history.map((x) => x.used), daily_quota);
              const heightPct = max > 0 ? (h.used / max) * 100 : 0;
              return (
                <div key={h.date} className="flex-1 flex flex-col items-center gap-2">
                  <div className="w-full flex-1 flex items-end">
                    <div
                      className="w-full rounded-t-lg bg-gradient-to-t from-[#3BA4FF] to-[#7CC4FF] min-h-[6px] transition-all"
                      style={{ height: `${Math.max(6, heightPct)}%`, opacity: h.used === 0 ? 0.25 : 1 }}
                      title={`${h.used} pts`}
                    />
                  </div>
                  <span className="text-[10px] font-bold text-[#475569] uppercase">
                    {fr.daysShort[(d.getDay() + 6) % 7][0]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Quotas par poste */}
      <div className="ms-card p-6">
        <h3 className="text-lg font-bold text-[#071B34]">Quotas par poste MS Park</h3>
        <p className="text-xs text-[#475569] mt-1">
          Crédités automatiquement chaque jour travaillé après badge d'entrée.
        </p>
        <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
          {POSTE_GROUPS.map((g) => {
            const isMe = g.key === me.role_category;
            return (
              <div
                key={g.key}
                className={`rounded-2xl p-5 transition-all ${
                  isMe ? "ring-2 ring-[#F59E0B] bg-[#FEF3C7]/40" : "border border-[#071B34]/5"
                }`}
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-base font-bold" style={{ color: g.color }}>
                    {g.title}
                  </h4>
                  {isMe && (
                    <span className="ms-chip bg-[#F59E0B] text-white">VOUS</span>
                  )}
                </div>
                <div className="mt-3 flex items-baseline">
                  <span className="text-5xl font-extrabold" style={{ color: g.color }}>
                    {g.pts}
                  </span>
                  <span className="text-sm text-[#475569] ml-1 font-medium">pts/jour</span>
                </div>
                <ul className="mt-4 space-y-1 text-sm text-[#475569]">
                  {g.roles.map((r) => (
                    <li key={r} className="flex items-center gap-2">
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: g.color }}
                      />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      <div className="ms-card p-5 flex items-start gap-4 bg-gradient-to-br from-[#3BA4FF]/8 to-transparent border border-[#3BA4FF]/15">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#3BA4FF]/15 text-[#3BA4FF]">
          <Info className="h-5 w-5" />
        </div>
        <p className="text-sm text-[#475569]">
          <strong className="text-[#071B34]">Badgeage uniquement sur site.</strong> Le badgeage est uniquement
          disponible physiquement sur site via votre badge employé MS Park, jamais en ligne.
        </p>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, color }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] font-semibold text-[#475569]">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
