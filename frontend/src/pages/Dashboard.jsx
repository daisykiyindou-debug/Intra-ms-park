import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Clock,
  CalendarDays,
  TrendingUp,
  Wallet,
  ArrowRight,
  UtensilsCrossed,
  Fingerprint,
  FileText,
  Newspaper,
  MessageSquare,
  Gift,
  Users,
  ArrowUpRight,
  MapPin,
  CircleDot,
  PauseCircle,
} from "lucide-react";
import { api, fr, formatMinutes } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";
import NewsCarousel from "@/components/NewsCarousel";
import useLiveData from "@/hooks/useLiveData";

const eventColor = {
  event: { bg: "#A78BFA22", color: "#7C3AED", label: "Événement" },
  training: { bg: "#FEF3C7", color: "#B45309", label: "Formation" },
  meeting: { bg: "#3BA4FF22", color: "#1D70B8", label: "Réunion" },
  birthday: { bg: "#FCE7F3", color: "#BE185D", label: "Anniv." },
  maintenance: { bg: "#F1F5F9", color: "#475569", label: "Maintenance" },
};

export default function Dashboard() {
  const { me } = useApp();
  const [data, setData] = useState(null);
  const [news, setNews] = useState([]);
  const [events, setEvents] = useState([]);
  const [points, setPoints] = useState(null);
  const [now, setNow] = useState(new Date());

  useLiveData(
    () => {
      api.get("/dashboard").then((r) => setData(r.data));
      api.get("/carousel").then((r) => {
        // If admin didn't feature anything, fall back to latest news
        if (r.data && r.data.length) setNews(r.data);
        else api.get("/news").then((n) => setNews(n.data));
      });
      api.get("/events").then((r) => setEvents(r.data));
      api.get("/meal-points/today").then((r) => setPoints(r.data));
    },
    ["carousel", "news", "events", "schedule", "me"]
  );

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
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

  const weekTarget = data.week_planned_minutes || data.week_hours_target;
  const weekPct = weekTarget > 0 ? Math.min(100, Math.round((data.week_minutes / weekTarget) * 100)) : 0;
  const nextShift = data.upcoming_schedule.find((s) => s.type === "shift");
  const parisTime = now.toLocaleTimeString("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parisDate = now.toLocaleDateString("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const upcomingEvents = events
    .filter((e) => new Date(e.date) >= new Date(new Date().setHours(0, 0, 0, 0)))
    .slice(0, 4);

  return (
    <div className="space-y-6 ms-fade-up">
      {/* Top bar: clock + next shift */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 ms-card p-5 flex items-center gap-5 bg-gradient-to-br from-white to-[#3BA4FF]/[0.04]">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#3BA4FF]/12 text-[#3BA4FF]">
            <Clock className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="ms-overline">Heure de Paris en temps réel</div>
            <div className="mt-1 flex items-baseline gap-3">
              <span className="font-mono text-3xl md:text-4xl font-extrabold tracking-tight text-[#071B34]">
                {parisTime}
              </span>
              <span className="text-xs text-[#475569] capitalize">{parisDate}</span>
            </div>
          </div>
        </div>
        <div className="lg:col-span-5 ms-card p-5 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#10B981]/12 text-[#10B981]">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="ms-overline">Prise de poste du jour</div>
            {data.today_schedule && data.today_schedule.type === "shift" ? (
              <div className="mt-1 text-sm text-[#071B34]">
                <strong className="text-base">
                  {data.today_schedule.start} – {data.today_schedule.end}
                </strong>
                <span className="text-[#475569] ml-2 text-xs">
                  · pause {data.today_schedule.pause_start}–{data.today_schedule.pause_end}
                </span>
              </div>
            ) : data.today_schedule && data.today_schedule.type === "off" ? (
              <div className="mt-1 inline-flex items-center gap-2 text-base font-bold text-[#475569]">
                <span className="ms-chip bg-[#F1F5F9] text-[#475569]">OFF</span>
                Profitez de votre journée ✨
              </div>
            ) : data.today_schedule && data.today_schedule.type === "leave" ? (
              <div className="mt-1 text-base font-bold text-[#7C3AED]">Congé validé</div>
            ) : data.today_schedule && data.today_schedule.type === "training" ? (
              <div className="mt-1 text-sm text-[#B45309]">
                <strong>Formation</strong> · {data.today_schedule.start} – {data.today_schedule.end}
              </div>
            ) : (
              <div className="mt-1 text-sm text-[#475569]">Aucun planning aujourd'hui</div>
            )}
          </div>
        </div>
      </div>

      {/* News carousel — FIRST */}
      <NewsCarousel items={news} />

      {/* Company agenda */}
      <div className="ms-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-[#071B34]">Agenda entreprise</h3>
          <Link
            to="/agenda"
            data-testid="see-agenda"
            className="text-xs font-semibold text-[#3BA4FF] hover:underline inline-flex items-center gap-1"
          >
            Voir tout <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {upcomingEvents.length === 0 && (
            <div className="col-span-full text-sm text-[#475569] py-6 text-center">
              Aucun événement à venir
            </div>
          )}
          {upcomingEvents.map((e) => {
            const m = eventColor[e.type] || eventColor.event;
            const d = new Date(e.date);
            return (
              <Link
                to="/agenda"
                key={e.id}
                data-testid={`dash-event-${e.id}`}
                className="rounded-2xl border border-[#071B34]/5 p-4 hover:border-[#3BA4FF]/40 hover:shadow-md transition-all"
              >
                <div className="flex items-baseline justify-between">
                  <div className="text-2xl font-extrabold text-[#071B34] capitalize tracking-tight">
                    {d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                  </div>
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-[#475569]">
                    {d.toLocaleDateString("fr-FR", { weekday: "short" })} · {e.time}
                  </span>
                </div>
                <div className="mt-2 text-sm font-bold text-[#071B34] line-clamp-2">{e.title}</div>
                <div className="mt-1 text-[11px] text-[#475569] inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {e.location}
                </div>
                <div className="mt-2">
                  <span className="ms-chip" style={{ background: m.bg, color: m.color }}>
                    {m.label}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard
          icon={Clock}
          label="Heures semaine"
          value={formatMinutes(data.week_minutes)}
          sub={`Planifié ${formatMinutes(data.week_planned_minutes || 0)} · ${weekPct}%`}
          accent="#3BA4FF"
        />
        <KPICard
          icon={TrendingUp}
          label="Taux présence"
          value={`${data.presence_rate}%`}
          sub="28 derniers jours"
          accent="#10B981"
        />
        <KPICard
          icon={CalendarDays}
          label="Shifts à venir"
          value={data.upcoming_schedule.filter((s) => s.type === "shift").length}
          sub="cette semaine"
          accent="#F59E0B"
        />
        <KPICard
          icon={FileText}
          label="Documents"
          value={data.documents_count}
          sub="dans mon espace"
          accent="#A78BFA"
        />
      </div>

      {/* Semaine en chiffres (synthèse planning) */}
      <div className="ms-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-[#071B34]">Ma semaine en chiffres</h3>
          <Link
            to="/rh/planning"
            className="text-xs font-semibold text-[#3BA4FF] hover:underline inline-flex items-center gap-1"
          >
            Voir planning <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <WeekStat
            label="Jours OFF"
            value={data.off_days_week ?? 0}
            color="#64748B"
            icon={PauseCircle}
            testid="stat-off"
          />
          <WeekStat
            label="Congés"
            value={data.leave_days_week ?? 0}
            color="#7C3AED"
            icon={CalendarDays}
            testid="stat-leave"
          />
          <WeekStat
            label="Retards"
            value={data.late_count_week ?? 0}
            color="#F59E0B"
            icon={CircleDot}
            testid="stat-late"
          />
          <WeekStat
            label="Absences"
            value={data.absence_count_week ?? 0}
            color="#EF4444"
            icon={CircleDot}
            testid="stat-absence"
          />
        </div>
      </div>

      {/* Points + Badgeage today */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <Link
          to="/points-repas"
          className="lg:col-span-4 ms-card ms-card-hover p-5 group flex flex-col justify-between"
          data-testid="dash-points-card"
        >
          <div className="flex items-center justify-between">
            <span className="ms-overline">Points repas du jour</span>
            <ArrowUpRight className="h-4 w-4 text-[#3BA4FF] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </div>
          {points && (
            <>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-4xl font-extrabold text-[#071B34]">{points.remaining}</span>
                <span className="text-sm text-[#475569]">/ {points.credited_points || points.daily_quota} pts</span>
              </div>
              <div className="text-xs text-[#475569] mt-1">Quota {me.role}</div>
              <div className="mt-3 h-2 w-full rounded-full bg-[#F1F5F9] overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#3BA4FF] to-[#1D70B8]"
                  style={{
                    width: `${
                      points.credited_points
                        ? Math.round((points.used / points.credited_points) * 100)
                        : 0
                    }%`,
                  }}
                />
              </div>
            </>
          )}
        </Link>
        <div className="lg:col-span-8 ms-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-bold text-[#071B34]">Badgeage aujourd'hui</h3>
            <Link to="/rh/badgeage" className="text-xs font-semibold text-[#3BA4FF] hover:underline">
              Voir tout
            </Link>
          </div>
          {data.today_badge ? (
            <BadgeRows badge={data.today_badge} schedule={data.today_schedule} />
          ) : (
            <div className="text-sm text-[#475569] py-4">
              Aucun badgeage enregistré aujourd'hui. Pensez à badger à votre arrivée sur site.
            </div>
          )}
        </div>
      </div>

      {/* Planning + quick access */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 ms-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-[#071B34]">Planning des prochains jours</h3>
            <Link
              to="/rh/planning"
              data-testid="see-planning"
              className="text-xs font-semibold text-[#3BA4FF] hover:underline inline-flex items-center gap-1"
            >
              Planning complet <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {data.upcoming_schedule.slice(0, 5).map((s) => {
              const d = new Date(s.day);
              const isToday = (() => {
                const t = new Date();
                return s.day === `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
              })();
              const isOff = s.type === "off";
              const isLeave = s.type === "leave";
              const isTraining = s.type === "training";
              return (
                <div
                  key={s.id}
                  className="flex items-center gap-4 rounded-xl border border-[#071B34]/5 p-3"
                  data-testid={`upcoming-${s.day}`}
                >
                  <div className="w-20 shrink-0">
                    <div className="text-sm font-bold text-[#071B34] capitalize">
                      {isToday
                        ? "Aujourd'hui"
                        : fr.daysShort[(d.getDay() + 6) % 7] + "."}
                    </div>
                    <div className="text-[11px] text-[#475569] capitalize">
                      {fr.daysShort[(d.getDay() + 6) % 7]}. {d.getDate()} {fr.months[d.getMonth()].slice(0, 4)}.
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 text-sm">
                    {isOff ? (
                      <span className="text-[#475569]">OFF</span>
                    ) : isLeave ? (
                      <span className="text-[#7C3AED] font-semibold">Congé validé</span>
                    ) : isTraining ? (
                      <span className="text-[#B45309] font-semibold">Formation · {s.note}</span>
                    ) : (
                      <span className="text-[#071B34] font-semibold">
                        {s.start} – {s.end}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[#475569] truncate max-w-[140px] text-right">
                    {isOff ? "OFF" : s.service || "—"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-5 ms-card p-6">
          <h3 className="text-lg font-bold text-[#071B34] mb-4">Accès rapide</h3>
          <div className="grid grid-cols-2 gap-3">
            <QuickLink to="/rh/planning" icon={CalendarDays} label="Mon Coin RH" color="#3BA4FF" />
            <QuickLink to="/points-repas" icon={Wallet} label="Points Repas" color="#F59E0B" />
            <QuickLink to="/restaurant" icon={UtensilsCrossed} label="Menu Resto" color="#EF4444" />
            <QuickLink to="/actualites" icon={Newspaper} label="Actualités" color="#A78BFA" />
            <QuickLink to="/avantages" icon={Gift} label="Avantages" color="#10B981" />
            <QuickLink to="/contacts" icon={Users} label="Contacts" color="#64748B" />
          </div>
        </div>
      </div>
    </div>
  );
}

function BadgeRows({ badge, schedule }) {
  const rows = [];
  if (badge.clock_in) rows.push({ time: badge.clock_in, label: "Entrée", color: "#10B981" });
  const ps = badge.pause_out || schedule?.pause_start;
  const pe = badge.pause_in || schedule?.pause_end;
  if (ps) rows.push({ time: ps, label: "Début pause", color: "#F59E0B" });
  if (pe) rows.push({ time: pe, label: "Fin pause", color: "#F59E0B" });
  if (badge.clock_out) rows.push({ time: badge.clock_out, label: "Sortie", color: "#3BA4FF" });

  if (rows.length === 0) {
    return <div className="text-sm text-[#475569] py-4">Pas encore badgé aujourd'hui</div>;
  }
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-4 py-2">
          <span className="font-mono text-sm font-semibold text-[#071B34] w-16">{r.time}</span>
          <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />
          <span className="text-sm text-[#071B34]">{r.label}</span>
        </div>
      ))}
    </div>
  );
}

function KPICard({ icon: Icon, label, value, sub, accent }) {
  return (
    <div className="ms-card ms-card-hover p-5">
      <div className="flex items-center justify-between">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ background: `${accent}1F`, color: accent }}
        >
          <Icon className="h-4 w-4" />
        </div>
        <TrendingUp className="h-3.5 w-3.5 text-[#475569]/40" />
      </div>
      <div className="mt-3 text-3xl font-bold tracking-tight text-[#071B34]">{value}</div>
      <div className="ms-overline mt-1">{label}</div>
      <div className="text-xs text-[#475569] mt-1">{sub}</div>
    </div>
  );
}

function QuickLink({ to, icon: Icon, label, color }) {
  return (
    <Link to={to} className="rounded-2xl border border-[#071B34]/5 p-4 hover:border-[#3BA4FF]/40 hover:shadow-md transition-all flex flex-col gap-2">
      <div
        className="flex h-10 w-10 items-center justify-center rounded-xl"
        style={{ background: `${color}1F`, color }}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="text-sm font-semibold text-[#071B34]">{label}</div>
    </Link>
  );
}

function WeekStat({ label, value, color, icon: Icon, testid }) {
  return (
    <div
      data-testid={testid}
      className="rounded-2xl border border-[#071B34]/5 p-4 flex items-center gap-3"
    >
      <div
        className="flex h-10 w-10 items-center justify-center rounded-xl shrink-0"
        style={{ background: `${color}1F`, color }}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-extrabold text-[#071B34] leading-none">{value}</div>
        <div className="text-[11px] uppercase tracking-wider font-semibold text-[#475569] mt-1">
          {label}
        </div>
      </div>
    </div>
  );
}
