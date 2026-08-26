import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  DoorOpen, Users, MapPin, Monitor, Video, Wifi, Zap, Volume2, Presentation,
  Calendar, ChevronLeft, ChevronRight, Search, Check, ArrowLeft, Clock, Sun,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";

const EQUIP_LABEL = {
  screen: "Écran de présentation", video: "Visioconférence",
  whiteboard: "Tableau blanc", power: "Prises électriques",
  wifi: "Connexion Wi-Fi", audio: "Système audio", hdmi: "Câble HDMI",
  paperboard: "Paperboard", computer: "Ordinateur", adapter: "Adaptateur",
  water: "Bouteilles d'eau", coffee: "Café", microphone: "Micro",
};
const MEETING_TYPES = [
  { k: "team", l: "Réunion d'équipe" },
  { k: "interview", l: "Entretien" },
  { k: "training", l: "Formation" },
  { k: "video", l: "Visioconférence" },
  { k: "external", l: "Rendez-vous externe" },
  { k: "direction", l: "Réunion de direction" },
  { k: "workshop", l: "Atelier" },
  { k: "other", l: "Autre" },
];
const DEFAULT_PHOTO = "https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=1200&q=80";

function todayISODate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function formatTime(iso) {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }).replace(":", "h");
}
function formatDate(iso) {
  const d = new Date(iso);
  const s = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function durationLabel(min) {
  return min < 60 ? `${min} min` : min % 60 === 0 ? `${min / 60}h` : `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;
}

export default function SalleReserver() {
  const { rid } = useParams();
  const nav = useNavigate();
  const { employees, me } = useApp();

  const [room, setRoom] = useState(null);
  const [availability, setAvailability] = useState({ reservations: [] });
  const [step, setStep] = useState(1);

  // Step 1
  const [date, setDate] = useState(todayISODate());
  const [duration, setDuration] = useState(60);
  const [customDuration, setCustomDuration] = useState("");
  const [allDay, setAllDay] = useState(false); // Toute la journée (08h → 20h)
  const [selectedSlot, setSelectedSlot] = useState(null); // { start, end }

  // Step 2
  const [title, setTitle] = useState("");
  const [meetingType, setMeetingType] = useState("team");
  const [participants, setParticipants] = useState([]);
  const [participantsCount, setParticipantsCount] = useState(1);
  const [description, setDescription] = useState("");
  const [equipments, setEquipments] = useState([]);
  const [specialRequest, setSpecialRequest] = useState("");
  const [empQ, setEmpQ] = useState("");

  const [saving, setSaving] = useState(false);
  // Recurrence — none | weekly | biweekly | monthly, with number of occurrences.
  const [recurrence, setRecurrence] = useState("none");
  const [recurrenceCount, setRecurrenceCount] = useState(4);

  useEffect(() => {
    api.get(`/rooms/${rid}`).then((r) => setRoom(r.data)).catch(() => nav("/salles"));
  }, [rid, nav]);

  useEffect(() => {
    if (!rid) return;
    api.get(`/rooms/${rid}/availability`, { params: { date } })
      .then((r) => setAvailability(r.data))
      .catch(() => setAvailability({ reservations: [] }));
  }, [rid, date]);

  const durOptions = [15, 30, 45, 60, 90, 120, 180, 240];

  // Compute the "Toute la journée" candidate slot (08:00 → 20:00) and check
  // whether the day is entirely free.
  const allDaySlot = useMemo(() => {
    const start = new Date(`${date}T08:00:00`);
    const end = new Date(`${date}T20:00:00`);
    const conflict = (availability.reservations || []).find(r => {
      const rs = new Date(r.start_ts).getTime();
      const re = new Date(r.end_ts).getTime();
      return start.getTime() < re && end.getTime() > rs;
    });
    return { start, end, conflict };
  }, [date, availability]);

  const startSlots = useMemo(() => {
    if (allDay) return []; // hide the granular grid in all-day mode
    const rows = [];
    const dayEnd = new Date(`${date}T20:00:00`);
    const now = new Date();
    for (let h = 8; h < 20; h++) {
      for (let m = 0; m < 60; m += 15) {
        const start = new Date(`${date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);
        const end = new Date(start.getTime() + duration * 60000);
        if (end > dayEnd) continue;
        // Skip past slots (start earlier than now)
        if (start < now) continue;
        const conflict = (availability.reservations || []).find(r => {
          const rs = new Date(r.start_ts).getTime();
          const re = new Date(r.end_ts).getTime();
          return start.getTime() < re && end.getTime() > rs;
        });
        // Only keep free slots — reserved ones are hidden from the grid
        // (they're still recapped below in the "Créneaux déjà réservés" pills).
        if (conflict) continue;
        rows.push({ start, end });
      }
    }
    return rows;
  }, [date, availability, duration, allDay]);
  const freeSlots = startSlots;

  // Whenever the user changes date/duration/mode, drop the previously picked slot
  useEffect(() => { setSelectedSlot(null); }, [date, duration, allDay]);

  const filteredEmps = (employees || []).filter(
    (e) => e.id !== me?.id && !e.is_super_admin && `${e.first_name} ${e.last_name}`.toLowerCase().includes(empQ.toLowerCase())
  );
  const capacityWarning = room && participantsCount > room.capacity;

  const canNext1 = !!selectedSlot;
  const canNext2 = title.trim().length > 0;

  const confirm = async () => {
    if (!selectedSlot) return;
    setSaving(true);
    try {
      const body = {
        room_id: rid,
        title: title.trim(),
        meeting_type: meetingType,
        start_ts: selectedSlot.start,
        end_ts: selectedSlot.end,
        participants_ids: participants,
        participants_count: Number(participantsCount) || participants.length + 1,
        description,
        equipments_needed: equipments,
        special_request: specialRequest,
      };
      if (recurrence !== "none") {
        body.recurrence_frequency = recurrence;
        body.recurrence_count = Math.max(2, Math.min(52, Number(recurrenceCount) || 2));
      }
      const { data } = await api.post("/reservations", body);
      const n = data?.count || 1;
      toast.success(n > 1 ? `${n} réservations confirmées (récurrence)` : "Réservation confirmée");
      nav("/salles");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Impossible de réserver");
    } finally {
      setSaving(false);
    }
  };

  if (!room) return <div className="p-8 text-center text-[#475569]">Chargement…</div>;

  const STEPS = [
    { k: 1, l: "Créneau" },
    { k: 2, l: "Détails" },
    { k: 3, l: "Confirmation" },
  ];

  return (
    <div className="ms-fade-up">
      {/* Header with breadcrumb + room banner */}
      <div className="mb-5 flex items-center gap-3">
        <Link to="/salles" className="ms-btn-secondary" data-testid="reserve-back">
          <ArrowLeft className="h-4 w-4" /> Retour
        </Link>
        <div>
          <div className="text-[11px] uppercase tracking-widest text-[#94A3B8]">Salles de réunion</div>
          <h1 className="text-2xl font-bold text-[#071B34]">Réserver — {room.name}</h1>
        </div>
      </div>

      {/* Steps indicator */}
      <div className="flex items-center gap-2 mb-6" data-testid="reserve-steps">
        {STEPS.map((s, i) => {
          const done = step > s.k;
          const active = step === s.k;
          return (
            <div key={s.k} className="flex items-center gap-2">
              <div className={`h-8 w-8 rounded-full inline-flex items-center justify-center text-xs font-bold ${
                active ? "bg-[#3BA4FF] text-white" : done ? "bg-emerald-500 text-white" : "bg-white ring-1 ring-[#071B34]/10 text-[#94A3B8]"
              }`}>
                {done ? <Check className="h-4 w-4" /> : s.k}
              </div>
              <span className={`text-sm font-semibold ${active ? "text-[#071B34]" : "text-[#94A3B8]"}`}>{s.l}</span>
              {i < STEPS.length - 1 && <ChevronRight className="h-4 w-4 text-[#CBD5E1] mx-1" />}
            </div>
          );
        })}
      </div>

      {/* Room banner (compact) with carousel */}
      <div className="ms-card overflow-hidden mb-5 grid grid-cols-1 sm:grid-cols-[280px_1fr] gap-0">
        <RoomCarousel photos={room.photos || [room.photo_url]} alt={room.name} />
        <div className="p-4 sm:p-5">
          <div className="text-base font-bold text-[#071B34]">{room.name}</div>
          <div className="text-xs text-[#475569] flex items-center gap-3 mt-1 flex-wrap">
            <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {room.capacity} personnes</span>
            {room.floor && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {room.floor}</span>}
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest ${
              room.status_key === "busy" ? "bg-amber-100 text-amber-800" :
              room.status_key === "maintenance" ? "bg-red-100 text-red-800" :
              "bg-emerald-100 text-emerald-800"
            }`}>{room.status_label}</span>
          </div>
          {room.description && (
            <p className="text-sm text-[#475569] mt-3">{room.description}</p>
          )}
        </div>
      </div>

      {/* Step content */}
      {step === 1 && (
        <div className="ms-card p-6 space-y-6" data-testid="reserve-step-1">
          {/* Duration */}
          <div>
            <div className="text-xs uppercase tracking-widest font-semibold text-[#475569] mb-3">Durée de votre réunion</div>
            <div className="flex flex-wrap gap-2">
              {durOptions.map((d) => (
                <button
                  key={d}
                  onClick={() => { setAllDay(false); setDuration(d); setCustomDuration(""); }}
                  data-testid={`dur-${d}`}
                  className={`px-4 py-2 rounded-full text-sm font-semibold transition ${!allDay && duration === d ? "bg-[#3BA4FF] text-white shadow" : "bg-white ring-1 ring-[#071B34]/10 hover:bg-[#F4F7FA] text-[#475569]"}`}
                >
                  {durationLabel(d)}
                </button>
              ))}
              <div className="inline-flex items-center gap-1">
                <input
                  type="number"
                  min={15}
                  max={480}
                  step={15}
                  placeholder="Autre"
                  value={customDuration}
                  onChange={(e) => {
                    setAllDay(false);
                    setCustomDuration(e.target.value);
                    const v = parseInt(e.target.value, 10);
                    if (!Number.isNaN(v) && v >= 15) setDuration(v);
                  }}
                  data-testid="dur-custom"
                  className="w-24 h-10 px-3 rounded-full bg-white ring-1 ring-[#071B34]/10 text-sm outline-none focus:ring-[#3BA4FF]/40"
                />
                <span className="text-xs text-[#94A3B8]">min</span>
              </div>
              <button
                onClick={() => setAllDay(true)}
                data-testid="dur-allday"
                className={`px-4 py-2 rounded-full text-sm font-semibold transition inline-flex items-center gap-1.5 ${allDay ? "bg-[#F59E0B] text-white shadow" : "bg-white ring-1 ring-[#F59E0B]/40 hover:bg-[#FEF3C7] text-[#B45309]"}`}
              >
                <Sun className="h-4 w-4" /> Toute la journée
              </button>
            </div>
          </div>

          {/* Date */}
          <div>
            <div className="text-xs uppercase tracking-widest font-semibold text-[#475569] mb-3">Date</div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const d = new Date(date); d.setDate(d.getDate() - 1);
                  setDate(d.toISOString().slice(0, 10));
                }}
                className="h-10 w-10 rounded-full bg-white ring-1 ring-[#071B34]/10 hover:bg-[#F4F7FA] inline-flex items-center justify-center"
                data-testid="date-prev"
              ><ChevronLeft className="h-4 w-4" /></button>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="ms-input"
                data-testid="reserve-date"
              />
              <button
                onClick={() => {
                  const d = new Date(date); d.setDate(d.getDate() + 1);
                  setDate(d.toISOString().slice(0, 10));
                }}
                className="h-10 w-10 rounded-full bg-white ring-1 ring-[#071B34]/10 hover:bg-[#F4F7FA] inline-flex items-center justify-center"
                data-testid="date-next"
              ><ChevronRight className="h-4 w-4" /></button>
              <span className="ml-3 text-sm text-[#475569]">{formatDate(date)}</span>
            </div>
          </div>

          {/* Slots — only available slots are listed */}
          <div>
            <div className="text-xs uppercase tracking-widest font-semibold text-[#475569] mb-3 flex items-center gap-2">
              <span>{allDay ? "Journée complète" : `Créneaux disponibles (${startSlots.length})`}</span>
              <span className="ml-auto text-[10px] text-[#94A3B8] flex items-center gap-3">
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-200"></span> Libre</span>
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-[#3BA4FF]"></span> Sélectionné</span>
              </span>
            </div>
            {allDay ? (
              (() => {
                const conflict = allDaySlot.conflict;
                const startIso = allDaySlot.start.toISOString();
                const endIso = allDaySlot.end.toISOString();
                const isSel = selectedSlot?.start === startIso;
                if (conflict) {
                  return (
                    <div className="rounded-xl bg-amber-50 text-amber-800 text-sm p-4 text-center" data-testid="allday-conflict">
                      La journée ne peut pas être réservée en totalité : au moins un créneau est déjà occupé. Essayez une autre date ou choisissez une durée plus courte.
                    </div>
                  );
                }
                return (
                  <button
                    onClick={() => setSelectedSlot({ start: startIso, end: endIso })}
                    data-testid="slot-allday"
                    className={`w-full text-left px-5 py-6 rounded-2xl transition ${
                      isSel
                        ? "bg-[#F59E0B] text-white shadow-lg ring-2 ring-[#F59E0B]/40"
                        : "bg-amber-50 hover:bg-amber-100 text-amber-900"
                    }`}
                  >
                    <div className="text-xl font-bold flex items-center gap-2">
                      <Sun className="h-5 w-5" /> Toute la journée
                      {isSel && <Check className="h-5 w-5 ml-auto" />}
                    </div>
                    <div className={`text-sm mt-1 ${isSel ? "text-white/90" : "text-amber-800"}`}>
                      08h00 → 20h00 · 12 heures
                    </div>
                  </button>
                );
              })()
            ) : startSlots.length === 0 ? (
              <div className="rounded-xl bg-amber-50 text-amber-800 text-sm p-4 text-center">
                Aucun créneau disponible pour cette durée sur cette date. Essayez une autre date, une durée plus courte, ou une autre salle.
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 max-h-[360px] overflow-y-auto pr-1">
                {startSlots.map((s, i) => {
                  const startIso = s.start.toISOString();
                  const endIso = s.end.toISOString();
                  const isSel = selectedSlot?.start === startIso;
                  return (
                    <button
                      key={i}
                      onClick={() => setSelectedSlot({ start: startIso, end: endIso })}
                      data-testid={`slot-${i}`}
                      className={`text-left px-3 py-3 rounded-xl text-sm font-semibold transition relative ${
                        isSel
                          ? "bg-[#3BA4FF] text-white shadow-lg ring-2 ring-[#3BA4FF]/40"
                          : "bg-emerald-50 hover:bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      <div className="tabular-nums text-base">{formatTime(startIso)}</div>
                      <div className={`text-[11px] font-normal ${isSel ? "text-white/80" : "text-emerald-700"}`}>
                        → {formatTime(endIso)}
                      </div>
                      {isSel && <Check className="absolute top-2 right-2 h-4 w-4" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {availability.reservations?.length > 0 && (
            <div>
              <div className="text-[11px] text-[#94A3B8] mb-1">Créneaux déjà réservés</div>
              <div className="flex flex-wrap gap-1.5">
                {availability.reservations.map((r) => (
                  <span key={r.id} className={`text-[11px] px-2 py-1 rounded-full ${r.is_mine ? "bg-[#3BA4FF]/15 text-[#1D70B8]" : "bg-amber-100 text-amber-800"}`}>
                    {formatTime(r.start_ts)} – {formatTime(r.end_ts)}
                    {r.is_mine ? " · Votre réservation" : ` · ${r.title || "Occupé"}`}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-[#071B34]/5">
            <Link to="/salles" className="px-4 py-2 rounded-xl text-sm text-[#475569] hover:bg-[#F4F7FA]" data-testid="reserve-cancel">Annuler</Link>
            <button
              onClick={() => setStep(2)}
              disabled={!canNext1}
              data-testid="reserve-next-1"
              className="ms-btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Suivant <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="ms-card p-6 space-y-4" data-testid="reserve-step-2">
          <div className="text-xs uppercase tracking-widest font-semibold text-[#475569]">Informations sur la réunion</div>

          <div>
            <label className="ms-overline">Titre de la réunion *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="ms-input mt-1" placeholder="Ex : Point équipe hebdo" data-testid="reserve-title" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="ms-overline">Type de réunion</label>
              <select value={meetingType} onChange={(e) => setMeetingType(e.target.value)} className="ms-input mt-1" data-testid="reserve-type">
                {MEETING_TYPES.map((t) => <option key={t.k} value={t.k}>{t.l}</option>)}
              </select>
            </div>
            <div>
              <label className="ms-overline">Nombre de participants</label>
              <input type="number" min={1} value={participantsCount} onChange={(e) => setParticipantsCount(e.target.value)} className="ms-input mt-1" data-testid="reserve-count" />
              {capacityWarning && (
                <div className="mt-1 text-[11px] text-amber-700 font-semibold" data-testid="reserve-capacity-warning">
                  ⚠ La salle est limitée à {room.capacity} personnes.
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="ms-overline">Description / ordre du jour</label>
            <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className="ms-input mt-1 resize-y" data-testid="reserve-desc" />
          </div>

          <div>
            <label className="ms-overline">Participants internes</label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8]" />
              <input value={empQ} onChange={(e) => setEmpQ(e.target.value)} placeholder="Rechercher un collègue…" className="w-full h-10 pl-9 pr-3 rounded-xl bg-white ring-1 ring-[#071B34]/10 outline-none text-sm" data-testid="reserve-part-search" />
            </div>
            <div className="mt-2 max-h-52 overflow-y-auto space-y-1 pr-1 rounded-xl bg-[#F8FAFC] p-2">
              {filteredEmps.slice(0, 30).map((e) => {
                const on = participants.includes(e.id);
                return (
                  <button key={e.id} onClick={() => setParticipants((p) => on ? p.filter(x => x !== e.id) : [...p, e.id])} className={`w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${on ? "bg-[#3BA4FF]/10 text-[#1D70B8] font-semibold" : "hover:bg-white text-[#334155]"}`} data-testid={`reserve-part-${e.id}`}>
                    <span className="flex-1 text-left truncate">{e.first_name} {e.last_name} <span className="text-[10px] text-[#94A3B8]">· {e.role || "—"}</span></span>
                    {on && <Check className="h-4 w-4" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="ms-overline">Équipements nécessaires</label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {Object.entries(EQUIP_LABEL).map(([k, l]) => {
                const on = equipments.includes(k);
                return (
                  <button key={k} onClick={() => setEquipments((s) => on ? s.filter(x => x !== k) : [...s, k])} className={`px-3 py-1.5 rounded-full text-[12px] font-semibold ${on ? "bg-[#3BA4FF] text-white" : "bg-white ring-1 ring-[#071B34]/10 text-[#475569]"}`} data-testid={`reserve-eq-${k}`}>
                    {l}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="ms-overline">Demande particulière</label>
            <textarea rows={2} value={specialRequest} onChange={(e) => setSpecialRequest(e.target.value)} className="ms-input mt-1 resize-y" data-testid="reserve-special" placeholder="Ex : disposition en U, café pour 8 personnes…" />
          </div>

          {/* ─── Récurrence ─── */}
          <div className="rounded-2xl border border-[#3BA4FF]/20 bg-[#3BA4FF]/5 p-3">
            <label className="ms-overline text-[#1D70B8]">Réunion récurrente ?</label>
            <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-1.5">
              {[
                ["none", "Ponctuelle"],
                ["weekly", "Chaque semaine"],
                ["biweekly", "Toutes les 2 semaines"],
                ["monthly", "Chaque mois"],
              ].map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setRecurrence(k)}
                  data-testid={`recurrence-${k}`}
                  className={`px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${
                    recurrence === k
                      ? "bg-[#1D70B8] text-white shadow"
                      : "bg-white text-[#334155] hover:bg-[#3BA4FF]/10 ring-1 ring-[#3BA4FF]/20"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
            {recurrence !== "none" && (
              <div className="mt-3 flex items-center gap-2">
                <label className="text-xs font-semibold text-[#475569] whitespace-nowrap">Nombre d'occurrences :</label>
                <input
                  type="number"
                  min={2}
                  max={52}
                  value={recurrenceCount}
                  onChange={(e) => setRecurrenceCount(e.target.value)}
                  data-testid="recurrence-count"
                  className="ms-input !py-1.5 !text-xs w-20"
                />
                <span className="text-[10px] text-[#475569] italic">
                  {(() => {
                    const n = Math.max(2, Math.min(52, Number(recurrenceCount) || 2));
                    const step = recurrence === "weekly" ? 7 : recurrence === "biweekly" ? 14 : 30;
                    const totalDays = (n - 1) * step;
                    return `${n} rendez-vous au total, jusqu'à ~${Math.round(totalDays / 7)} semaines`;
                  })()}
                </span>
              </div>
            )}
            {recurrence !== "none" && (
              <div className="mt-2 text-[10px] text-[#B45309] italic">
                ⚠ Toutes les occurrences seront vérifiées ; si l'une est en conflit, aucune ne sera enregistrée.
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-[#071B34]/5">
            <button onClick={() => setStep(1)} className="ms-btn-secondary" data-testid="reserve-prev-2">
              <ChevronLeft className="h-4 w-4" /> Précédent
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!canNext2}
              data-testid="reserve-next-2"
              className="ms-btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Suivant <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {step === 3 && selectedSlot && (
        <div className="ms-card p-6 space-y-4" data-testid="reserve-step-3">
          <div className="text-xs uppercase tracking-widest font-semibold text-[#475569]">Récapitulatif de la réservation</div>
          <div className="rounded-2xl bg-gradient-to-br from-[#3BA4FF]/10 to-[#3BA4FF]/5 p-5 space-y-3">
            <div className="text-2xl font-bold text-[#071B34]">{title}</div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <RecapRow label="Salle" value={room.name} />
              <RecapRow label="Étage" value={room.floor || "—"} />
              <RecapRow label="Date" value={formatDate(selectedSlot.start)} />
              <RecapRow label="Horaire" value={allDay ? "Toute la journée (08h – 20h)" : `${formatTime(selectedSlot.start)} – ${formatTime(selectedSlot.end)}`} />
              <RecapRow label="Durée" value={allDay ? "Journée complète" : durationLabel(duration)} />
              <RecapRow label="Type" value={MEETING_TYPES.find(t => t.k === meetingType)?.l} />
              <RecapRow label="Participants" value={`${participantsCount} personne${participantsCount > 1 ? "s" : ""}`} />
              <RecapRow label="Équipements" value={(equipments.length ? equipments.map(e => EQUIP_LABEL[e]).join(", ") : "—")} />
              {recurrence !== "none" && (
                <RecapRow
                  label="Récurrence"
                  value={`${{weekly:"Chaque semaine",biweekly:"Toutes les 2 semaines",monthly:"Chaque mois"}[recurrence]} · ${Math.max(2, Math.min(52, Number(recurrenceCount) || 2))} occurrences`}
                />
              )}
            </div>
            {description && (
              <div className="text-sm">
                <div className="ms-overline">Ordre du jour</div>
                <div className="mt-1 text-[#334155] whitespace-pre-wrap">{description}</div>
              </div>
            )}
            {participants.length > 0 && (
              <div className="text-sm">
                <div className="ms-overline">Participants invités</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {participants.map((pid) => {
                    const e = (employees || []).find(x => x.id === pid);
                    if (!e) return null;
                    return (
                      <span key={pid} className="inline-flex items-center gap-1 rounded-full bg-white ring-1 ring-[#071B34]/10 px-2 py-1 text-xs">
                        {e.first_name} {e.last_name}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
            {specialRequest && (
              <div className="text-sm">
                <div className="ms-overline">Demande particulière</div>
                <div className="mt-1 text-[#334155] whitespace-pre-wrap">{specialRequest}</div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-[#071B34]/5">
            <button onClick={() => setStep(2)} className="ms-btn-secondary" data-testid="reserve-prev-3">
              <ChevronLeft className="h-4 w-4" /> Modifier
            </button>
            <button
              onClick={confirm}
              disabled={saving}
              data-testid="reserve-confirm"
              className="ms-btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Check className="h-4 w-4" /> {saving ? "Confirmation…" : "Confirmer la réservation"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function RecapRow({ label, value }) {
  return (
    <div>
      <div className="ms-overline">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-[#071B34]">{value}</div>
    </div>
  );
}

// Simple photo carousel with prev/next buttons + dots + arrow keys
function RoomCarousel({ photos, alt }) {
  const [idx, setIdx] = useState(0);
  const list = photos && photos.length > 0 ? photos : [DEFAULT_PHOTO];
  const prev = () => setIdx((i) => (i - 1 + list.length) % list.length);
  const next = () => setIdx((i) => (i + 1) % list.length);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.length]);
  return (
    <div className="relative h-40 sm:h-52 shrink-0 rounded-2xl overflow-hidden bg-[#F4F7FA]" data-testid="room-carousel">
      <img
        src={list[idx]}
        alt={alt}
        onError={(e) => { e.currentTarget.src = DEFAULT_PHOTO; }}
        className="w-full h-full object-cover transition-opacity duration-300"
      />
      {list.length > 1 && (
        <>
          <button
            onClick={prev}
            data-testid="room-carousel-prev"
            aria-label="Photo précédente"
            className="absolute left-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-white/90 hover:bg-white shadow inline-flex items-center justify-center text-[#334155]"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={next}
            data-testid="room-carousel-next"
            aria-label="Photo suivante"
            className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-white/90 hover:bg-white shadow inline-flex items-center justify-center text-[#334155]"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
            {list.map((_, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                aria-label={`Photo ${i + 1}`}
                data-testid={`room-carousel-dot-${i}`}
                className={`h-1.5 rounded-full transition-all ${i === idx ? "w-6 bg-white" : "w-1.5 bg-white/60"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
