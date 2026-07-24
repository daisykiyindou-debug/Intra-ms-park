import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Clock, Coffee, LogIn, LogOut, Fingerprint, ChevronDown, ChevronUp,
  CheckCircle2, AlertCircle, TrendingUp, CalendarClock, ArrowUpRight, Plus, X,
  Users, Calendar as CalendarIcon, GraduationCap, Package, Wrench, MoreHorizontal, Trash2, Paperclip,
} from "lucide-react";
import { toast } from "sonner";
import { api, formatDateFr } from "@/lib/api";
import useLiveData from "@/hooks/useLiveData";
import { useApp } from "@/contexts/AppContext";
import PortalModal from "@/components/PortalModal";

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const fmtHM = (min) => {
  if (!min || min < 0) return "0h 00";
  const h = Math.floor(min / 60);
  const m = Math.abs(min % 60);
  return `${h}h ${String(m).padStart(2, "0")}`;
};

export default function Badgeage() {
  const { me } = useApp();
  const [history, setHistory] = useState([]);
  const [today, setToday] = useState(null);
  const [counter, setCounter] = useState(null);
  const [collapsed, setCollapsed] = useState(true);
  const [punchModal, setPunchModal] = useState(false);
  const [overtimeModal, setOvertimeModal] = useState(false);
  const [recoveryModal, setRecoveryModal] = useState(false);

  const load = async () => {
    const [h, t, c] = await Promise.all([
      api.get("/badging?filter_range=month").then((r) => r.data),
      api.get("/badging/today-live").then((r) => r.data),
      api.get("/overtime/counter").then((r) => r.data),
    ]);
    setHistory(h);
    setToday(t);
    setCounter(c);
  };

  useLiveData(load, ["badging", "overtime"]);
  useEffect(() => { load(); }, []); // eslint-disable-line

  const punch = async () => {
    try {
      const { data } = await api.post("/badging/punch");
      toast.success(`${data.label} · ${data.time}`);
      setPunchModal(false);
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Erreur");
    }
  };

  // Week rows for the current week
  const weekRows = useMemo(() => {
    const now = new Date();
    const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const rows = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday); d.setDate(monday.getDate() + i);
      const iso = d.toISOString().slice(0, 10);
      const entry = history.find((h) => h.day === iso) || (today?.day === iso ? today : null);
      rows.push({ date: d, iso, entry, dayName: DAYS[i] });
    }
    return rows;
  }, [history, today]);

  const weekTotal = weekRows.reduce((s, r) => s + (r.entry?.worked_minutes || 0), 0);
  const contractWeek = (me?.contract_hours_weekly || 24) * 60;
  const dailyTarget = Math.round(contractWeek / 5);
  const monthWorkDaysPassed = Math.max(1, Math.min(22, Math.ceil(new Date().getDate() * 5 / 7)));
  const monthTarget = Math.round(contractWeek * 4.33);
  const monthTotal = history.reduce((s, h) => s + (h.worked_minutes || 0), 0) + (today?.worked_minutes || 0);

  const nextStep = useMemo(() => {
    if (!today) return null;
    if (!today.clock_in) return { k: "clock_in", l: "Entrée", ic: LogIn };
    if (!today.pause_out) return { k: "pause_out", l: "Pause (sortie)", ic: Coffee };
    if (!today.pause_in) return { k: "pause_in", l: "Pause (entrée)", ic: Coffee };
    if (!today.clock_out) return { k: "clock_out", l: "Sortie", ic: LogOut };
    return null;
  }, [today]);

  const dayStatusLabel = today?.clock_out ? "Journée complète" : today?.clock_in ? today.note : "En attente de pointage";
  const dayStatusColor = today?.clock_out ? "bg-[#10B981]/15 text-[#047857]" : today?.clock_in ? "bg-[#3BA4FF]/15 text-[#1D70B8]" : "bg-[#F59E0B]/15 text-[#B45309]";

  return (
    <div className="space-y-5 ms-fade-up">
      {/* Header */}
      <div className="ms-card p-5 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#10B981] animate-pulse" />
            <h1 className="text-2xl md:text-3xl font-bold text-[#071B34]">Mon badge</h1>
          </div>
          <p className="text-xs text-[#475569] mt-1">
            {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
            {today?.clock_in && ` · Pointage à ${today.clock_in}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setCollapsed((v) => !v)} data-testid="btn-history" className="ms-btn-outline text-xs">
            {collapsed ? "Historique complet" : "Réduire"} {collapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
          </button>
          <button onClick={() => setPunchModal(true)} data-testid="btn-badge" className="rounded-xl bg-[#3BA4FF] text-white text-sm font-semibold px-4 py-2 hover:bg-[#2A8DE0]">
            <Fingerprint className="h-4 w-4 inline mr-1" /> Badgeage
          </button>
        </div>
      </div>

      {/* Today's punches (4 cards) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <PunchCard label="Entrée" time={today?.clock_in} icon={Clock} accent="#10B981" />
        <PunchCard label="Pause (sortie)" time={today?.pause_out} icon={Coffee} accent="#F59E0B" />
        <PunchCard label="Pause (entrée)" time={today?.pause_in} icon={Coffee} accent="#8B5CF6" />
        <PunchCard label="Sortie" time={today?.clock_out} icon={LogOut} accent="#EF4444" />
      </div>

      {/* Objectifs : Jour / Semaine / Mois avec jauges de progression et heures restantes */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <ObjectiveCard
          label="Aujourd'hui"
          worked={today?.worked_minutes || 0}
          target={dailyTarget}
          accent="#3BA4FF"
          hint={`Objectif journalier · ${fmtHM(dailyTarget)}`}
        />
        <ObjectiveCard
          label="Cette semaine"
          worked={weekTotal}
          target={contractWeek}
          accent="#10B981"
          hint={`Contrat ${me?.contract_hours_weekly || 24}h / semaine`}
        />
        <ObjectiveCard
          label="Ce mois-ci"
          worked={monthTotal}
          target={monthTarget}
          accent="#8B5CF6"
          hint={`≈ ${Math.round(monthTarget / 60)}h prévues`}
        />
      </div>

      {/* Today's summary */}
      <div className="ms-card p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="ms-overline">Heures travaillées</div>
          <div className="text-3xl font-bold text-[#071B34] mt-1">{fmtHM(today?.worked_minutes)}</div>
          <div className="text-xs text-[#94A3B8] mt-0.5">sur {fmtHM(dailyTarget)} prévues</div>
        </div>
        <div>
          <div className="ms-overline">Statut du jour</div>
          <div className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${dayStatusColor}`}>
            <CheckCircle2 className="h-3 w-3" /> {dayStatusLabel}
          </div>
        </div>
      </div>

      {/* Weekly table */}
      <div className="ms-card p-0 overflow-hidden">
        <div className="p-5 flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-[#3BA4FF]" />
          <h2 className="text-lg font-bold text-[#071B34]">Récapitulatif de la semaine</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#F4F7FA] text-[#475569] text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left p-3 font-semibold">Jour</th>
                <th className="text-left p-3 font-semibold">Entrée</th>
                <th className="text-left p-3 font-semibold">Pause (sortie)</th>
                <th className="text-left p-3 font-semibold">Pause (entrée)</th>
                <th className="text-left p-3 font-semibold">Sortie</th>
                <th className="text-right p-3 font-semibold">Heures travaillées</th>
                <th className="text-right p-3 font-semibold">Retard</th>
              </tr>
            </thead>
            <tbody>
              {weekRows.map((r) => {
                const isToday = r.iso === new Date().toISOString().slice(0, 10);
                return (
                  <tr key={r.iso} className={`border-t border-[#071B34]/5 ${isToday ? "bg-[#3BA4FF]/5 font-semibold" : ""}`}>
                    <td className="p-3 text-[#334155]">{r.dayName}. {r.date.getDate().toString().padStart(2, "0")}/{(r.date.getMonth() + 1).toString().padStart(2, "0")}</td>
                    <td className="p-3">{r.entry?.clock_in || "-"}</td>
                    <td className="p-3">{r.entry?.pause_out || "-"}</td>
                    <td className="p-3">{r.entry?.pause_in || "-"}</td>
                    <td className="p-3">{r.entry?.clock_out || "-"}</td>
                    <td className="p-3 text-right font-bold text-[#071B34]">{r.entry ? fmtHM(r.entry.worked_minutes) : "-"}</td>
                    <td className="p-3 text-right text-[#94A3B8]">{r.entry?.anomaly ? <span className="text-[#EF4444]">{r.entry.anomaly}</span> : "-"}</td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-[#071B34]/10 bg-[#F4F7FA] font-bold">
                <td className="p-3">Total semaine</td>
                <td colSpan={4}></td>
                <td className="p-3 text-right text-[#071B34]">{fmtHM(weekTotal)}</td>
                <td className="p-3 text-right text-[#94A3B8]">-</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Weekly summary (4 cards) */}
      <div>
        <h2 className="text-lg font-bold text-[#071B34] mb-3">Récapitulatif hebdomadaire</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <SummaryCard icon={Clock} accent="#10B981" label="Heures travaillées" value={fmtHM(weekTotal)} sub={`sur ${fmtHM(contractWeek)} prévues`} />
          <SummaryCard icon={TrendingUp} accent="#8B5CF6" label="Heures supplémentaires" value={`+${fmtHM(Math.max(0, weekTotal - contractWeek))}`} sub="cette semaine" />
          <SummaryCard icon={Users} accent="#F59E0B" label="Heures prévues" value={fmtHM(contractWeek)} sub="" />
          <SummaryCard icon={AlertCircle} accent="#EF4444" label="Solde hebdomadaire" value={`${weekTotal - contractWeek >= 0 ? "+" : ""}${fmtHM(weekTotal - contractWeek)}`} sub="par rapport aux prévues" />
        </div>
      </div>

      {/* Monthly summary + Recovery counter */}
      {counter && (
        <div className="ms-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-[#3BA4FF]" />
            <h2 className="text-lg font-bold text-[#071B34]">Récapitulatif mensuel</h2>
          </div>
          <div className="text-xs text-[#475569]">{new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</div>

          <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6 items-center">
            <MonthlyDonut worked={monthTotal} declared={counter.declared_minutes} available={counter.available_minutes} />
            <div className="space-y-2 text-sm">
              <Row label="Heures travaillées" val={fmtHM(monthTotal)} accent="#3BA4FF" />
              <Row label="Heures supplémentaires validées" val={`+${fmtHM(counter.declared_minutes)}`} accent="#10B981" />
              <Row label="Heures en attente de validation" val={`+${fmtHM(counter.pending_minutes)}`} accent="#F59E0B" />
              <Row label="Récupérations utilisées" val={`-${fmtHM(counter.recovered_minutes)}`} accent="#8B5CF6" />
              <div className="pt-2 mt-2 border-t border-[#071B34]/10 flex justify-between font-bold">
                <span className="text-[#071B34]">Solde du mois</span>
                <span className="text-[#10B981]">+{fmtHM(counter.available_minutes)}</span>
              </div>
            </div>
          </div>

          {counter.can_request_recovery ? (
            <div className="rounded-2xl bg-[#10B981]/10 p-4 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-[#10B981]" />
                <div>
                  <div className="text-sm text-[#071B34]">
                    Vous avez <span className="font-bold text-[#10B981]">+{fmtHM(counter.available_minutes)}</span> d&apos;heures supplémentaires ce mois-ci.
                  </div>
                  <div className="text-xs text-[#475569]">Vous pouvez faire une demande de récupération (RTT).</div>
                </div>
              </div>
              <button onClick={() => setRecoveryModal(true)} data-testid="btn-recovery" className="rounded-xl bg-[#10B981] text-white text-sm font-semibold px-4 py-2 hover:bg-[#059669]">
                Demander une récupération (RTT)
              </button>
            </div>
          ) : (
            <div className="rounded-2xl bg-[#F4F7FA] p-4 text-xs text-[#475569]">
              Vous pouvez faire une demande de récupération à partir de 6h d&apos;heures supplémentaires validées.
            </div>
          )}

          <button onClick={() => setOvertimeModal(true)} data-testid="btn-declare-overtime" className="w-full rounded-xl border-2 border-dashed border-[#3BA4FF]/40 text-[#1D70B8] text-sm font-semibold py-3 hover:bg-[#3BA4FF]/5">
            <Plus className="h-4 w-4 inline mr-1" /> Déclarer des heures exceptionnelles
          </button>
        </div>
      )}

      {/* Historique complet (expanded) */}
      {!collapsed && (
        <div className="ms-card p-5 space-y-3">
          <h3 className="text-base font-bold text-[#071B34]">Historique complet (30 derniers jours)</h3>
          <div className="space-y-1 text-sm">
            {history.slice(0, 30).map((h, i) => (
              <div key={i} className="grid grid-cols-6 gap-2 py-1 border-b border-[#071B34]/5">
                <div className="text-[#334155]">{formatDateFr(h.day)}</div>
                <div>{h.clock_in || "-"}</div>
                <div>{h.pause_out || "-"}</div>
                <div>{h.pause_in || "-"}</div>
                <div>{h.clock_out || "-"}</div>
                <div className="text-right font-bold text-[#071B34]">{fmtHM(h.worked_minutes)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODALS */}
      {punchModal && <PunchModal onClose={() => setPunchModal(false)} onPunch={punch} nextStep={nextStep} today={today} />}
      {overtimeModal && <OvertimeDeclareModal onClose={() => setOvertimeModal(false)} onSaved={() => { setOvertimeModal(false); load(); }} />}
      {recoveryModal && <RecoveryRequestModal counter={counter} onClose={() => setRecoveryModal(false)} onSaved={() => { setRecoveryModal(false); load(); }} />}
    </div>
  );
}

function ObjectiveCard({ label, worked, target, accent, hint }) {
  const pct = target > 0 ? Math.min(100, Math.round((worked / target) * 100)) : 0;
  const remaining = Math.max(0, target - worked);
  const over = worked > target;
  return (
    <div className="ms-card p-5" data-testid={`objective-${label}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="ms-overline">{label}</div>
          <div className="mt-1 text-2xl font-bold text-[#071B34]">
            {fmtHM(worked)} <span className="text-sm font-normal text-[#94A3B8]">/ {fmtHM(target)}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-[#94A3B8]">Progression</div>
          <div className="text-2xl font-bold" style={{ color: accent }}>{pct}%</div>
        </div>
      </div>
      <div className="mt-3 h-2.5 rounded-full bg-[#F4F7FA] overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: accent }} />
      </div>
      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="text-[#94A3B8]">{hint}</span>
        <span className={`font-semibold ${over ? "text-[#10B981]" : remaining > 0 ? "text-[#F59E0B]" : "text-[#10B981]"}`}>
          {over
            ? `+${fmtHM(worked - target)} · en avance`
            : remaining > 0
            ? `Il reste ${fmtHM(remaining)}`
            : "Objectif atteint"}
        </span>
      </div>
    </div>
  );
}


function PunchCard({ label, time, icon: Icon, accent }) {
  return (
    <div className="ms-card p-4 flex flex-col items-start gap-2" data-testid={`punch-${label}`}>
      <div className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ background: `${accent}20`, color: accent }}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="text-xs text-[#475569]">{label}</div>
      <div className={`text-2xl font-bold ${time ? "text-[#071B34]" : "text-[#94A3B8]"}`}>{time || "--:--"}</div>
      <div className="text-[10px] text-[#10B981]">{time ? "Pointage effectué" : ""}</div>
    </div>
  );
}

function SummaryCard({ icon: Icon, accent, label, value, sub }) {
  return (
    <div className="ms-card p-4 flex items-center gap-3">
      <div className="h-11 w-11 rounded-xl flex items-center justify-center" style={{ background: `${accent}20`, color: accent }}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1">
        <div className="text-xs text-[#475569]">{label}</div>
        <div className="text-lg font-bold text-[#071B34]">{value}</div>
        {sub && <div className="text-xs text-[#94A3B8]">{sub}</div>}
      </div>
    </div>
  );
}

function Row({ label, val, accent }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-[#334155]">
        <span className="h-2 w-2 rounded-full" style={{ background: accent }} />
        {label}
      </div>
      <div className="font-bold text-[#071B34]">{val}</div>
    </div>
  );
}

function MonthlyDonut({ worked, declared, available }) {
  const total = Math.max(worked + declared, 1);
  const workedPct = (worked / total) * 100;
  const declaredPct = (declared / total) * 100;
  return (
    <div className="relative flex items-center justify-center">
      <svg viewBox="0 0 42 42" className="w-40 h-40">
        <circle cx="21" cy="21" r="15.9" fill="transparent" stroke="#F4F7FA" strokeWidth="4" />
        <circle
          cx="21" cy="21" r="15.9"
          fill="transparent"
          stroke="#3BA4FF" strokeWidth="4"
          strokeDasharray={`${workedPct} ${100 - workedPct}`}
          strokeDashoffset="25"
        />
        <circle
          cx="21" cy="21" r="15.9"
          fill="transparent"
          stroke="#10B981" strokeWidth="4"
          strokeDasharray={`${declaredPct} ${100 - declaredPct}`}
          strokeDashoffset={`${25 - workedPct}`}
        />
      </svg>
      <div className="absolute text-center">
        <div className="text-2xl font-bold text-[#3BA4FF]">+{fmtHM(available)}</div>
        <div className="text-[10px] text-[#475569]">Solde du mois</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Punch modal
// ═══════════════════════════════════════════════════════════════════
function PunchModal({ onClose, onPunch, nextStep, today }) {
  return (
    <PortalModal>
    <div onClick={onClose} className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-[#071B34]">Badgeage en ligne</h2>
          <button onClick={onClose} className="h-9 w-9 rounded-xl hover:bg-[#F4F7FA]"><X className="h-4 w-4 mx-auto" /></button>
        </div>
        {!nextStep ? (
          <div className="text-center py-6 text-sm text-[#10B981]">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-2" />
            Tous les pointages du jour sont effectués.
          </div>
        ) : (
          <>
            <div className="rounded-2xl bg-[#F4F7FA] p-5 text-center">
              <div className="text-xs text-[#475569]">Prochain pointage</div>
              <div className="mt-1 text-2xl font-bold text-[#071B34] inline-flex items-center gap-2">
                <nextStep.ic className="h-5 w-5 text-[#3BA4FF]" /> {nextStep.l}
              </div>
              <div className="mt-2 text-3xl font-bold text-[#3BA4FF]">
                {new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-[#475569]">
              <div className="rounded-lg bg-[#F4F7FA] p-2">Entrée : <span className="font-bold text-[#071B34]">{today?.clock_in || "--:--"}</span></div>
              <div className="rounded-lg bg-[#F4F7FA] p-2">Pause (sortie) : <span className="font-bold text-[#071B34]">{today?.pause_out || "--:--"}</span></div>
              <div className="rounded-lg bg-[#F4F7FA] p-2">Pause (entrée) : <span className="font-bold text-[#071B34]">{today?.pause_in || "--:--"}</span></div>
              <div className="rounded-lg bg-[#F4F7FA] p-2">Sortie : <span className="font-bold text-[#071B34]">{today?.clock_out || "--:--"}</span></div>
            </div>
            <button onClick={onPunch} data-testid="btn-punch-confirm" className="w-full rounded-xl bg-[#3BA4FF] text-white font-bold py-3 hover:bg-[#2A8DE0]">
              <Fingerprint className="h-4 w-4 inline mr-2" /> Badger maintenant
            </button>
          </>
        )}
      </div>
    </div>
    </PortalModal>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Overtime declaration modal
// ═══════════════════════════════════════════════════════════════════
const EVENT_TYPES = [
  { k: "event", l: "Événement", ic: CalendarIcon },
  { k: "meeting", l: "Réunion", ic: Users },
  { k: "training", l: "Formation", ic: GraduationCap },
  { k: "inventory", l: "Inventaire", ic: Package },
  { k: "intervention", l: "Intervention", ic: Wrench },
  { k: "other", l: "Autre", ic: MoreHorizontal },
];

function OvertimeDeclareModal({ onClose, onSaved }) {
  const [f, setF] = useState({
    event_type: "event", reason: "", center: "", date: new Date().toISOString().slice(0, 10),
    start_time: "", end_time: "", pauses: [], comment: "", attachment_url: "", attachment_name: "",
  });
  const [managers, setManagers] = useState([]);
  useEffect(() => { api.get("/employees").then((r) => setManagers(r.data.filter((e) => e.is_admin || e.role_category === "encadrement"))); }, []);

  const dur = useMemo(() => {
    const toMin = (hm) => { const [h, m] = (hm || "").split(":").map(Number); return h * 60 + (m || 0); };
    let mins = Math.max(0, toMin(f.end_time) - toMin(f.start_time));
    (f.pauses || []).forEach((p) => { mins -= Math.max(0, toMin(p.end) - toMin(p.start)); });
    return Math.max(0, mins);
  }, [f.start_time, f.end_time, f.pauses]);

  const addPause = () => setF({ ...f, pauses: [...f.pauses, { start: "", end: "" }] });
  const rmPause = (i) => setF({ ...f, pauses: f.pauses.filter((_, j) => j !== i) });
  const setPause = (i, patch) => setF({ ...f, pauses: f.pauses.map((p, j) => j === i ? { ...p, ...patch } : p) });

  const uploadAttachment = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData(); fd.append("file", file);
    const { data } = await api.post("/uploads", fd, { headers: { "Content-Type": "multipart/form-data" } });
    setF({ ...f, attachment_url: data.url, attachment_name: file.name });
  };

  const submit = async () => {
    if (!f.reason.trim()) { toast.error("Motif requis"); return; }
    if (!f.start_time || !f.end_time) { toast.error("Horaires requis"); return; }
    try {
      await api.post("/overtime/declare", f);
      toast.success("Demande envoyée");
      onSaved();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Erreur");
    }
  };

  return (
    <PortalModal>
    <div onClick={onClose} className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-3xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between p-5 border-b border-[#071B34]/5 z-10">
          <div>
            <div className="ms-overline">Accueil › Badge › Déclarer des heures exceptionnelles</div>
            <h2 className="text-2xl font-bold text-[#071B34]">Déclarer des heures exceptionnelles</h2>
            <p className="text-xs text-[#475569] mt-0.5">Déclarez les heures travaillées en dehors de vos horaires habituels.</p>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-xl hover:bg-[#F4F7FA]"><X className="h-4 w-4 mx-auto" /></button>
        </div>

        <div className="p-5 space-y-5">
          <div className="ms-card p-4 space-y-3">
            <h3 className="text-base font-bold text-[#071B34]">1. Informations générales</h3>
            <div>
              <label className="ms-overline">Type d&apos;heure exceptionnelle *</label>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mt-2">
                {EVENT_TYPES.map((t) => {
                  const I = t.ic;
                  const sel = f.event_type === t.k;
                  return (
                    <button key={t.k} onClick={() => setF({ ...f, event_type: t.k })} data-testid={`ot-type-${t.k}`}
                      className={`rounded-xl p-3 flex flex-col items-center gap-1 transition-colors ${sel ? "bg-[#3BA4FF]/10 border-2 border-[#3BA4FF] text-[#1D70B8]" : "bg-[#F4F7FA] border-2 border-transparent text-[#475569]"}`}>
                      <I className="h-4 w-4" />
                      <span className="text-xs font-semibold">{t.l}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="ms-overline">Nom de l&apos;événement / motif *</label>
                <input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} data-testid="ot-reason" placeholder="Soirée Halloween MS Park" className="ms-input mt-1" />
              </div>
              <div>
                <label className="ms-overline">Centre concerné</label>
                <input value={f.center} onChange={(e) => setF({ ...f, center: e.target.value })} placeholder="MS Park Thiais" className="ms-input mt-1" />
              </div>
              <div>
                <label className="ms-overline">Date de l&apos;événement *</label>
                <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} data-testid="ot-date" className="ms-input mt-1" />
              </div>
              <div>
                <label className="ms-overline">Responsable (si connu)</label>
                <select value={f.manager_id || ""} onChange={(e) => setF({ ...f, manager_id: e.target.value })} className="ms-input mt-1">
                  <option value="">—</option>
                  {managers.map((m) => <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="ms-card p-4 space-y-3">
            <h3 className="text-base font-bold text-[#071B34]">2. Horaires travaillés</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="ms-overline">Heure de début *</label>
                <input type="time" value={f.start_time} onChange={(e) => setF({ ...f, start_time: e.target.value })} data-testid="ot-start" className="ms-input mt-1" />
              </div>
              <div>
                <label className="ms-overline">Heure de fin *</label>
                <input type="time" value={f.end_time} onChange={(e) => setF({ ...f, end_time: e.target.value })} data-testid="ot-end" className="ms-input mt-1" />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="ms-overline">Pause(s) éventuelle(s)</label>
                <button onClick={addPause} className="text-xs font-semibold text-[#3BA4FF]"><Plus className="h-3 w-3 inline" /> Ajouter une pause</button>
              </div>
              {f.pauses.map((p, i) => (
                <div key={i} className="grid grid-cols-[80px_1fr_1fr_auto] gap-2 items-center mb-2">
                  <div className="text-xs text-[#475569]">Pause {i + 1}</div>
                  <input type="time" value={p.start} onChange={(e) => setPause(i, { start: e.target.value })} placeholder="Début" className="ms-input" />
                  <input type="time" value={p.end} onChange={(e) => setPause(i, { end: e.target.value })} placeholder="Fin" className="ms-input" />
                  <button onClick={() => rmPause(i)} className="text-[#B91C1C]"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
            <div className="rounded-xl bg-[#3BA4FF]/10 p-3">
              <div className="text-xs text-[#475569]">Durée totale déclarée</div>
              <div className="text-2xl font-bold text-[#071B34]">{fmtHM(dur)} <span className="text-xs font-normal text-[#475569]">(hors pauses)</span></div>
            </div>
          </div>

          <div className="ms-card p-4 space-y-3">
            <h3 className="text-base font-bold text-[#071B34]">3. Informations complémentaires</h3>
            <div>
              <label className="ms-overline">Commentaire (optionnel)</label>
              <textarea rows={3} maxLength={250} value={f.comment} onChange={(e) => setF({ ...f, comment: e.target.value })} className="ms-input mt-1" />
              <div className="text-[10px] text-right text-[#94A3B8]">{f.comment.length}/250</div>
            </div>
            <div>
              <label className="ms-overline">Pièce jointe (optionnel)</label>
              <div className="mt-1 flex items-center gap-2">
                <label className="inline-flex items-center gap-1.5 rounded-lg bg-[#3BA4FF] text-white text-xs font-semibold px-3 py-1.5 cursor-pointer">
                  <Paperclip className="h-3 w-3" /> Choisir un fichier
                  <input type="file" className="hidden" onChange={uploadAttachment} data-testid="ot-attachment" />
                </label>
                {f.attachment_name && <span className="text-xs text-[#334155]">{f.attachment_name}</span>}
              </div>
            </div>
          </div>

          <div className="ms-card p-4 bg-[#10B981]/5 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-xs text-[#475569]">Durée totale à valider</div>
              <div className="text-3xl font-bold text-[#10B981]">{fmtHM(dur)}</div>
              <div className="text-xs text-[#475569] mt-1">Ces heures seront ajoutées à votre solde après validation.</div>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 bg-white flex gap-2 justify-end p-5 border-t border-[#071B34]/5">
          <button onClick={onClose} className="ms-btn-outline">Annuler</button>
          <button onClick={submit} data-testid="ot-submit" className="ms-btn-primary">Envoyer la demande</button>
        </div>
      </div>
    </div>
    </PortalModal>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Recovery request modal
// ═══════════════════════════════════════════════════════════════════
function RecoveryRequestModal({ counter, onClose, onSaved }) {
  const [kind, setKind] = useState("full_day");
  const [dates, setDates] = useState([]);
  const [comment, setComment] = useState("");
  const [certified, setCertified] = useState(false);
  const [minutes, setMinutes] = useState(0);

  const addDate = (d) => { if (d && !dates.includes(d)) setDates([...dates, d]); };
  const rmDate = (d) => setDates(dates.filter((x) => x !== d));

  const estMinutes = kind === "full_day" ? dates.length * (5 * 60 + 59)
    : kind === "half_day" ? dates.length * 180
    : minutes;

  const submit = async () => {
    if (!certified) { toast.error("Veuillez cocher la certification"); return; }
    if (dates.length === 0) { toast.error("Sélectionnez au moins une date"); return; }
    try {
      await api.post("/overtime/recovery", { kind, dates, minutes: estMinutes, comment });
      toast.success("Demande envoyée");
      onSaved();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Erreur");
    }
  };

  return (
    <PortalModal>
    <div onClick={onClose} className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-3xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white p-5 border-b border-[#071B34]/5 z-10 flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-[#10B981]/15 flex items-center justify-center"><CheckCircle2 className="h-5 w-5 text-[#10B981]" /></div>
            <div>
              <h2 className="text-lg font-bold text-[#071B34]">Vous avez <span className="text-[#10B981]">+{fmtHM(counter?.available_minutes || 0)}</span> d&apos;heures supplémentaires ce mois-ci.</h2>
              <p className="text-xs text-[#475569]">Vous pouvez faire une demande de récupération (RTT) à partir de 6h d&apos;heures supplémentaires.</p>
            </div>
          </div>
          <div className="text-right">
            <div className="rounded-xl bg-[#10B981]/10 p-3">
              <div className="text-xs text-[#475569]">Solde à récupérer</div>
              <div className="text-2xl font-bold text-[#10B981]">+{fmtHM(counter?.available_minutes || 0)}</div>
            </div>
            <button onClick={onClose} className="mt-2 h-8 w-8 rounded-xl hover:bg-[#F4F7FA] mx-auto"><X className="h-4 w-4 mx-auto" /></button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div className="ms-card p-4 space-y-3">
            <h3 className="text-base font-bold text-[#071B34]">1. Informations de la demande</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-[#475569]">Solde d&apos;heures supplémentaires</div>
                <div className="text-xl font-bold text-[#10B981]">+{fmtHM(counter?.available_minutes || 0)}</div>
              </div>
              <div>
                <div className="text-xs text-[#475569]">Seuil minimum</div>
                <div className="text-xl font-bold text-[#071B34]">6h 00</div>
              </div>
            </div>
            <div className="rounded-xl bg-[#3BA4FF]/10 p-3 text-xs text-[#334155] flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-[#3BA4FF] shrink-0 mt-0.5" />
              Votre demande doit être posée et récupérée dans les 10 jours à venir.
            </div>
            <div>
              <label className="ms-overline">Date(s) souhaitée(s) pour la récupération *</label>
              <div className="mt-2 space-y-2">
                {[
                  { k: "full_day", l: "Journée complète", d: "Récupérer une ou plusieurs journées" },
                  { k: "half_day", l: "Demi-journée", d: "Matin ou après-midi" },
                  { k: "precise", l: "Heures précises", d: "Choisir des créneaux horaires" },
                ].map((o) => (
                  <label key={o.k} className={`flex items-start gap-2 rounded-xl p-2 cursor-pointer ${kind === o.k ? "bg-[#3BA4FF]/10" : ""}`}>
                    <input type="radio" checked={kind === o.k} onChange={() => setKind(o.k)} data-testid={`rec-kind-${o.k}`} className="mt-1" />
                    <div>
                      <div className="text-sm font-semibold text-[#071B34]">{o.l}</div>
                      <div className="text-[10px] text-[#475569]">{o.d}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="ms-overline">Sélectionnez la/les date(s) *</label>
              <div className="mt-1 flex gap-2 items-center">
                <input type="date" onChange={(e) => addDate(e.target.value)} data-testid="rec-date" className="ms-input flex-1" />
                <span className="text-xs text-[#475569]">Jours sélectionnés : {dates.length}</span>
              </div>
              {dates.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {dates.map((d) => (
                    <span key={d} className="ms-chip bg-[#3BA4FF]/15 text-[#1D70B8]">
                      {formatDateFr(d)} <button onClick={() => rmDate(d)} className="ml-1"><X className="h-3 w-3 inline" /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            {kind === "precise" && (
              <div>
                <label className="ms-overline">Minutes précises</label>
                <input type="number" min={0} step={30} value={minutes} onChange={(e) => setMinutes(parseInt(e.target.value) || 0)} className="ms-input mt-1" />
              </div>
            )}
            <div>
              <label className="ms-overline">Commentaire (optionnel)</label>
              <textarea rows={2} maxLength={200} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Précisez si besoin (raison de la demande, planning, etc.)" className="ms-input mt-1" />
              <div className="text-[10px] text-right text-[#94A3B8]">{comment.length}/200</div>
            </div>
          </div>

          <div className="ms-card p-4 space-y-2">
            <h3 className="text-base font-bold text-[#071B34]">2. Récapitulatif de la demande</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Row label="Solde d'heures supplémentaires actuel" val={`+${fmtHM(counter?.available_minutes || 0)}`} accent="#10B981" />
              <Row label="Date(s) sélectionnée(s)" val={dates.length ? `${dates.length} jour(s)` : "Aucune"} accent="#3BA4FF" />
              <Row label="Heures qui seront récupérées" val={`-${fmtHM(estMinutes)}`} accent="#F59E0B" />
              <Row label="Type de récupération" val={kind === "full_day" ? "Journée" : kind === "half_day" ? "Demi-journée" : "Précises"} accent="#8B5CF6" />
            </div>
            <div className="mt-2 rounded-xl bg-[#F4F7FA] p-3 text-xs text-[#334155] space-y-1">
              <div className="font-bold text-[#071B34]">Rappel des règles</div>
              <div>• Votre demande doit être posée et récupérée dans les 10 jours à venir.</div>
              <div>• À partir de 6h d&apos;heures supplémentaires, vous pouvez demander une récupération (RTT).</div>
              <div>• Si les heures ne sont pas récupérées dans le délai, elles seront payées en heures supplémentaires.</div>
            </div>
          </div>

          <div className="ms-card p-4">
            <h3 className="text-base font-bold text-[#071B34] mb-2">3. Validation</h3>
            <label className="flex items-center gap-2 text-sm text-[#334155]">
              <input type="checkbox" checked={certified} onChange={(e) => setCertified(e.target.checked)} data-testid="rec-certify" />
              Je certifie que les informations renseignées sont exactes.
            </label>
          </div>
        </div>

        <div className="sticky bottom-0 bg-white flex gap-2 justify-end p-5 border-t border-[#071B34]/5">
          <button onClick={onClose} className="ms-btn-outline">Annuler</button>
          <button onClick={submit} data-testid="rec-submit" className="ms-btn-primary">Envoyer la demande</button>
        </div>
      </div>
    </div>
    </PortalModal>
  );
}
