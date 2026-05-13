import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Cloud,
  Sun,
  CloudSun,
  Clock,
  CalendarDays,
  TrendingUp,
  CheckCircle2,
  PauseCircle,
  MapPinOff,
  CircleDot,
  Moon,
  Wallet,
  Bell,
  MessageSquare,
  FileText,
  ArrowRight,
  Sparkles,
  UtensilsCrossed,
  Fingerprint,
  Newspaper,
} from "lucide-react";
import { api, formatMinutes, fr } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";
import NewsCarousel from "@/components/NewsCarousel";

const statusConfig = {
  service: { label: "En service", color: "#10B981", bg: "#D1FAE5", Icon: CircleDot, pulse: true },
  pause: { label: "En pause", color: "#F59E0B", bg: "#FEF3C7", Icon: PauseCircle },
  hors_site: { label: "Hors site", color: "#64748B", bg: "#F1F5F9", Icon: MapPinOff },
  end: { label: "Fin de service", color: "#3BA4FF", bg: "#E0F2FE", Icon: CheckCircle2 },
  off: { label: "Jour OFF", color: "#94A3B8", bg: "#F1F5F9", Icon: Moon },
};

export default function Dashboard() {
  const { me } = useApp();
  const [data, setData] = useState(null);
  const [news, setNews] = useState([]);

  useEffect(() => {
    api.get("/dashboard").then((r) => setData(r.data));
    api.get("/news").then((r) => setNews(r.data));
  }, []);

  if (!data || !me) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="ms-card p-8 animate-pulse h-32" />
        ))}
      </div>
    );
  }

  const status = statusConfig[data.live_status] || statusConfig.off;
  const StatusIcon = status.Icon;
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Bonjour";
    if (h < 18) return "Bel après-midi";
    return "Bonsoir";
  })();
  const weather = data.weather;
  const weekPct = Math.min(100, Math.round((data.week_minutes / data.week_hours_target) * 100));

  return (
    <div className="space-y-6 ms-fade-up">
      {/* Hero greeting */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#071B34] via-[#0B2545] to-[#071B34] p-8 md:p-10 text-white ms-grain">
          <div className="absolute -right-10 -top-10 h-64 w-64 rounded-full bg-[#3BA4FF]/20 blur-3xl" />
          <div className="absolute -left-10 -bottom-10 h-48 w-48 rounded-full bg-[#3BA4FF]/10 blur-3xl" />
          <div className="relative flex items-center gap-5">
            <img
              src={me.avatar}
              alt={me.first_name}
              className="h-16 w-16 md:h-20 md:w-20 rounded-2xl object-cover ring-4 ring-white/10 shadow-xl"
            />
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-[0.2em] text-[#3BA4FF] font-semibold">
                {fr.daysLong[(new Date().getDay() + 6) % 7]} ·{" "}
                {new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
              </div>
              <h1 className="mt-1 text-3xl md:text-4xl font-bold tracking-tight">
                {greeting}, {me.first_name} <span className="inline-block">👋</span>
              </h1>
              <p className="mt-1 text-sm md:text-base text-white/70">
                {me.role} · {me.department}
              </p>
            </div>
          </div>

          <div className="relative mt-8 flex flex-wrap items-center gap-3">
            <div
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold backdrop-blur-md"
              style={{ background: `${status.color}22`, color: status.color }}
              data-testid="status-pill"
            >
              <span
                className={`inline-flex h-2 w-2 rounded-full ${status.pulse ? "ms-pulse-ring" : ""}`}
                style={{ background: status.color }}
              />
              <StatusIcon className="h-4 w-4" />
              {status.label}
            </div>
            {data.today_schedule && data.today_schedule.type === "shift" && (
              <div className="inline-flex items-center gap-2 rounded-full bg-white/8 px-4 py-2 text-sm text-white/90 backdrop-blur-md">
                <Clock className="h-4 w-4 text-[#3BA4FF]" />
                Prise de poste {data.today_schedule.start} – {data.today_schedule.end}
              </div>
            )}
            {data.live_status === "service" && (
              <div className="inline-flex items-center gap-2 rounded-full bg-white/8 px-4 py-2 text-sm text-white/90 backdrop-blur-md">
                <Sparkles className="h-4 w-4 text-[#3BA4FF]" />
                Travaillé aujourd'hui ·{" "}
                <span className="font-bold">{formatMinutes(data.worked_minutes_today)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Weather + quick stats */}
        <div className="lg:col-span-4 ms-card p-6 flex flex-col justify-between">
          <div>
            <div className="ms-overline">Météo · {weather.city}</div>
            <div className="mt-3 flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#3BA4FF]/15 to-[#3BA4FF]/5">
                <CloudSun className="h-7 w-7 text-[#3BA4FF]" />
              </div>
              <div>
                <div className="text-4xl font-bold tracking-tight text-[#071B34]">
                  {weather.temp}°
                </div>
                <div className="text-sm text-[#475569]">{weather.condition}</div>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-4 text-xs text-[#475569]">
              <span className="inline-flex items-center gap-1">
                <Sun className="h-3.5 w-3.5 text-[#F59E0B]" /> {weather.high}°
              </span>
              <span className="inline-flex items-center gap-1">
                <Cloud className="h-3.5 w-3.5 text-[#64748B]" /> {weather.low}°
              </span>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-[#071B34]/5">
            <div className="ms-overline">Cette semaine</div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-[#071B34]">{formatMinutes(data.week_minutes)}</span>
              <span className="text-sm text-[#475569]">/ 24h00</span>
            </div>
            <div className="mt-3 h-2 w-full rounded-full bg-[#F1F5F9] overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#3BA4FF] to-[#1D70B8] transition-all duration-700"
                style={{ width: `${weekPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* News carousel */}
      <NewsCarousel items={news} />

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          icon={Clock}
          label="Heures semaine"
          value={formatMinutes(data.week_minutes)}
          sub={`Objectif 24h00 · ${weekPct}%`}
          accent="#3BA4FF"
          testid="kpi-week"
        />
        <KPICard
          icon={TrendingUp}
          label="Taux présence"
          value={`${data.presence_rate}%`}
          sub="28 derniers jours"
          accent="#10B981"
          testid="kpi-presence"
        />
        <KPICard
          icon={Bell}
          label="Notifications"
          value={data.unread_notifications}
          sub="non lues"
          accent="#F59E0B"
          testid="kpi-notif"
        />
        <KPICard
          icon={FileText}
          label="Documents"
          value={data.documents_count}
          sub="dans votre espace"
          accent="#A78BFA"
          testid="kpi-docs"
        />
      </div>

      {/* Quick access + upcoming schedule */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 ms-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-[#071B34]">Mes prochains jours</h3>
            <Link
              to="/rh/planning"
              data-testid="see-planning"
              className="text-xs font-semibold text-[#3BA4FF] hover:underline inline-flex items-center gap-1"
            >
              Voir le planning <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-[#071B34]/5">
            {data.upcoming_schedule.slice(0, 5).map((s) => {
              const d = new Date(s.day);
              const isOff = s.type === "off";
              const isLeave = s.type === "leave";
              const isTraining = s.type === "training";
              return (
                <div
                  key={s.id}
                  className="flex items-center gap-4 py-3"
                  data-testid={`upcoming-${s.day}`}
                >
                  <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-[#F4F7FA]">
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-[#475569]">
                      {fr.daysShort[(d.getDay() + 6) % 7]}
                    </span>
                    <span className="text-xl font-bold text-[#071B34]">{d.getDate()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    {isOff ? (
                      <>
                        <div className="text-sm font-semibold text-[#475569]">Jour de repos</div>
                        <div className="text-xs text-[#475569]/70">Profitez-en bien ✨</div>
                      </>
                    ) : isLeave ? (
                      <>
                        <div className="text-sm font-semibold text-[#7C3AED]">Congé validé</div>
                        <div className="text-xs text-[#475569]">{s.note}</div>
                      </>
                    ) : isTraining ? (
                      <>
                        <div className="text-sm font-semibold text-[#B45309]">Formation</div>
                        <div className="text-xs text-[#475569]">{s.note} · {s.location}</div>
                      </>
                    ) : (
                      <>
                        <div className="text-sm font-semibold text-[#071B34]">
                          {s.start} – {s.end}{" "}
                          <span className="text-xs font-normal text-[#475569]">
                            · pause {s.break_minutes}min
                          </span>
                        </div>
                        <div className="text-xs text-[#475569]">
                          {s.location} · Manager {s.manager}
                        </div>
                      </>
                    )}
                  </div>
                  <span
                    className="ms-chip"
                    style={{
                      background: isOff
                        ? "#F1F5F9"
                        : isLeave
                        ? "#EDE9FE"
                        : isTraining
                        ? "#FEF3C7"
                        : "#D1FAE5",
                      color: isOff
                        ? "#475569"
                        : isLeave
                        ? "#7C3AED"
                        : isTraining
                        ? "#B45309"
                        : "#065F46",
                    }}
                  >
                    {isOff ? "OFF" : isLeave ? "Congé" : isTraining ? "Formation" : "Shift"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-5 space-y-4">
          <h3 className="text-lg font-bold text-[#071B34] px-1">Accès rapides</h3>
          <div className="grid grid-cols-2 gap-3">
            <QuickLink to="/points-repas" icon={Wallet} label="Mes points repas" color="#3BA4FF" testid="qa-points" />
            <QuickLink to="/restaurant" icon={UtensilsCrossed} label="Commander un repas" color="#F59E0B" testid="qa-resto" />
            <QuickLink to="/rh/planning" icon={CalendarDays} label="Mon planning" color="#10B981" testid="qa-planning" />
            <QuickLink to="/rh/badgeage" icon={Fingerprint} label="Badgeage" color="#A78BFA" testid="qa-badge" />
            <QuickLink to="/rh/demandes" icon={FileText} label="Demandes RH" color="#EF4444" testid="qa-demandes" />
            <QuickLink to="/actualites" icon={Newspaper} label="Actualités" color="#3BA4FF" testid="qa-news" />
            <QuickLink to="/messagerie" icon={MessageSquare} label="Messagerie" color="#0EA5E9" testid="qa-chat" />
            <QuickLink to="/avantages" icon={Sparkles} label="Avantages" color="#EC4899" testid="qa-perks" />
          </div>
        </div>
      </div>
    </div>
  );
}

function KPICard({ icon: Icon, label, value, sub, accent, testid }) {
  return (
    <div className="ms-card ms-card-hover p-5" data-testid={testid}>
      <div className="flex items-center justify-between">
        <span className="ms-overline">{label}</span>
        <div
          className="flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ background: `${accent}1F`, color: accent }}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-3 text-3xl font-bold tracking-tight text-[#071B34]">{value}</div>
      <div className="text-xs text-[#475569] mt-1">{sub}</div>
    </div>
  );
}

function QuickLink({ to, icon: Icon, label, color, testid }) {
  return (
    <Link
      to={to}
      data-testid={testid}
      className="ms-card ms-card-hover group p-4 flex flex-col gap-2"
    >
      <div
        className="flex h-10 w-10 items-center justify-center rounded-xl transition-transform group-hover:scale-110"
        style={{ background: `${color}1F`, color }}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="text-sm font-semibold text-[#071B34] leading-tight">{label}</div>
    </Link>
  );
}
