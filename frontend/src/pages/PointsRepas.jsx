import { useEffect, useState } from "react";
import { Wallet, Clock, AlertTriangle, ShoppingBag, CheckCircle2, Info, Fingerprint } from "lucide-react";
import { Link } from "react-router-dom";
import { api, roleQuotaLabel } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";
import MealPointsGauge from "@/components/MealPointsGauge";

export default function PointsRepas() {
  const { me } = useApp();
  const [data, setData] = useState(null);

  useEffect(() => {
    const load = () => api.get("/meal-points/today").then((r) => setData(r.data));
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  if (!data || !me) return <div className="ms-card p-8 animate-pulse h-64" />;

  const { daily_quota, credited, credited_points, used, remaining, transactions, last_badge } = data;
  const usagePct = daily_quota ? Math.round((used / daily_quota) * 100) : 0;

  return (
    <div className="space-y-6 ms-fade-up">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <div className="ms-overline">Système Points Repas</div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[#071B34] mt-1">
            Mes points repas du jour
          </h1>
          <p className="mt-2 text-sm text-[#475569] max-w-2xl">
            Vos points sont crédités automatiquement chaque jour travaillé. Ils sont valables{" "}
            <strong className="text-[#071B34]">uniquement aujourd'hui</strong> et expirent à minuit.
          </p>
        </div>
        <Link to="/restaurant" data-testid="go-order" className="ms-btn-primary">
          <ShoppingBag className="h-4 w-4" />
          Commander un repas
        </Link>
      </div>

      {/* Top: gauge + quota card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 ms-card p-8 flex flex-col items-center justify-center text-center">
          <span className="ms-overline">Solde du jour</span>
          <div className="mt-4">
            <MealPointsGauge used={used} total={credited_points || daily_quota} size={240} />
          </div>
          <div className="mt-4 text-xs text-[#475569]">
            Expire à <strong className="text-[#071B34]">23h59</strong> ce soir
          </div>
        </div>

        <div className="lg:col-span-7 space-y-4">
          <div className="ms-card p-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="ms-overline">Quota journalier</span>
                <div className="text-2xl font-bold text-[#071B34] mt-1">{daily_quota} pts / jour</div>
              </div>
              <div
                className="ms-chip"
                style={{ background: "#3BA4FF20", color: "#1D70B8" }}
              >
                {roleQuotaLabel(me.role_category)}
              </div>
            </div>
            <p className="text-sm text-[#475569]">
              Selon votre poste <strong>{me.role}</strong>, vous bénéficiez de {daily_quota} points repas par jour
              travaillé. Non cumulables, non transférables.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <MiniStat label="Crédités" value={credited_points} suffix="pts" color="#10B981" testid="stat-credits" />
            <MiniStat label="Utilisés" value={used} suffix="pts" color="#3BA4FF" testid="stat-used" />
            <MiniStat label="Restants" value={remaining} suffix="pts" color="#F59E0B" testid="stat-remaining" />
          </div>

          {/* Badge status — NO BUTTON */}
          <div
            className={`ms-card p-5 flex items-start gap-4 ${
              credited ? "" : "ring-1 ring-[#F59E0B]/30 bg-[#FEF3C7]/30"
            }`}
            data-testid="badge-status"
          >
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                credited ? "bg-[#10B981]/15 text-[#10B981]" : "bg-[#F59E0B]/15 text-[#F59E0B]"
              }`}
            >
              {credited ? <CheckCircle2 className="h-5 w-5" /> : <Fingerprint className="h-5 w-5" />}
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-[#071B34]">
                {credited ? "Badge actif · points crédités" : "Badge non détecté aujourd'hui"}
              </div>
              <p className="text-xs text-[#475569] mt-1">
                {credited ? (
                  <>
                    Dernier badgeage à <strong>{last_badge?.clock_in}</strong>. Vos {credited_points}{" "}
                    points sont disponibles jusqu'à minuit.
                  </>
                ) : (
                  <>
                    Les points seront crédités automatiquement dès votre badgeage physique sur site.
                  </>
                )}
              </p>
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-[#3BA4FF]/10 px-2.5 py-1 text-[11px] font-medium text-[#1D70B8]">
                <Info className="h-3 w-3" />
                Le badgeage est uniquement disponible sur site via votre badge employé.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Today's transactions */}
      <div className="ms-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-[#071B34]">Historique du jour</h3>
          <span className="text-xs text-[#475569]">{transactions.length} achat(s)</span>
        </div>

        {transactions.length === 0 ? (
          <div className="py-10 text-center">
            <ShoppingBag className="mx-auto h-10 w-10 text-[#3BA4FF]/40" />
            <p className="mt-3 text-sm text-[#475569]">Aucun achat aujourd'hui.</p>
            <p className="text-xs text-[#475569]/70 mt-1">
              Direction le menu pour utiliser vos points avant qu'ils n'expirent !
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {transactions.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-4 rounded-2xl bg-[#F4F7FA] p-3"
                data-testid={`tx-${t.id}`}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white">
                  <Clock className="h-4 w-4 text-[#3BA4FF]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-[#071B34]">
                    {t.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}
                  </div>
                  <div className="text-xs text-[#475569]">
                    {new Date(t.ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}{" "}
                    · {t.location.replace("_", " ")}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-[#071B34]">-{t.points_spent} pts</div>
                  {t.surcharge_eur > 0 && (
                    <div className="text-xs text-[#475569]">+ {t.surcharge_eur.toFixed(2)} €</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 h-2 w-full rounded-full bg-[#F1F5F9] overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#3BA4FF] to-[#1D70B8] transition-all duration-700"
            style={{ width: `${usagePct}%` }}
          />
        </div>
        <div className="mt-2 text-xs text-[#475569]">
          {usagePct}% de votre quota consommé aujourd'hui
        </div>
      </div>

      {/* Conditions */}
      <div className="ms-card p-6 bg-gradient-to-br from-[#071B34] to-[#0B2545] text-white">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#3BA4FF]/15">
            <AlertTriangle className="h-5 w-5 text-[#3BA4FF]" />
          </div>
          <div>
            <h4 className="text-lg font-bold">Conditions du système Points Repas</h4>
            <ul className="mt-2 space-y-1 text-sm text-white/75">
              <li>✓ Crédités automatiquement chaque jour travaillé</li>
              <li>✓ Liés au badge employé MS Park</li>
              <li>✗ Non cumulables d'un jour à l'autre</li>
              <li>✗ Non transférables</li>
              <li>✗ Inutilisables en jour OFF ou absence</li>
              <li>✗ Pas de badgeage en ligne — uniquement physique sur site</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, suffix, color, testid }) {
  return (
    <div className="ms-card p-4 text-center" data-testid={testid}>
      <div className="text-[10px] uppercase tracking-[0.2em] font-semibold text-[#475569]">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold text-[#071B34]">
        {value}
        <span className="text-sm text-[#475569] font-medium ml-1">{suffix}</span>
      </div>
      <div className="mt-2 h-1 w-8 rounded-full mx-auto" style={{ background: color }} />
    </div>
  );
}
