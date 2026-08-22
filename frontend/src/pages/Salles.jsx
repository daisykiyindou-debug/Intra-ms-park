import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  DoorOpen, Users, MapPin, Monitor, Video, Wifi, Zap, Volume2, Presentation,
  Plus, Calendar, ChevronRight, Clock, Search, ArrowLeft, X, Check,
  Edit3, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";

const EQUIP_ICON = {
  screen: Monitor, video: Video, whiteboard: Presentation, power: Zap,
  wifi: Wifi, audio: Volume2, hdmi: Monitor, paperboard: Presentation,
  computer: Monitor, adapter: Zap, water: Zap, coffee: Zap, microphone: Volume2,
};
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

const STATUS_STYLE = {
  free: "bg-emerald-100 text-emerald-800",
  busy: "bg-amber-100 text-amber-800",
  maintenance: "bg-red-100 text-red-800",
};

function formatDT(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const date = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }).replace(":", "h");
  return `${date.charAt(0).toUpperCase()}${date.slice(1)} · ${time}`;
}
function formatTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }).replace(":", "h");
}
function todayISODate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function Salles() {
  const [rooms, setRooms] = useState([]);
  const [myReservations, setMyReservations] = useState([]);
  const nav = useNavigate();

  const load = () => {
    api.get("/rooms").then((r) => setRooms(r.data)).catch(() => {});
    api.get("/reservations?scope=upcoming").then((r) => setMyReservations(r.data)).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="ms-fade-up">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-[#071B34] tracking-tight flex items-center gap-2">
            <DoorOpen className="h-7 w-7 text-[#3BA4FF]" />
            Salles de réunion
          </h1>
          <p className="text-sm text-[#475569] mt-1">
            Consultez les disponibilités et réservez une salle en quelques clics.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/salles/mes-reservations" data-testid="rooms-my-btn" className="ms-btn-secondary">
            <Calendar className="h-4 w-4" /> Mes réservations
            {myReservations.length > 0 && (
              <span className="ml-1 inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-[#3BA4FF] text-white text-[10px] font-bold">
                {myReservations.length}
              </span>
            )}
          </Link>
        </div>
      </div>

      {/* Upcoming compact banner */}
      {myReservations.length > 0 && (
        <div className="ms-card p-4 mb-6" data-testid="rooms-upcoming-banner">
          <div className="text-[11px] uppercase tracking-widest font-semibold text-[#475569] mb-2">
            Vos prochaines réservations
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {myReservations.slice(0, 3).map((r) => (
              <Link
                key={r.id}
                to="/salles/mes-reservations"
                data-testid={`rooms-upcoming-${r.id}`}
                className="block rounded-xl bg-gradient-to-br from-[#3BA4FF]/10 to-[#3BA4FF]/5 hover:from-[#3BA4FF]/20 hover:to-[#3BA4FF]/10 p-3 transition"
              >
                <div className="text-xs text-[#1D70B8] font-semibold">{r.room_name}</div>
                <div className="text-sm font-bold text-[#071B34] truncate">{r.title}</div>
                <div className="text-xs text-[#475569] mt-1">
                  {formatDT(r.start_ts)} — {formatTime(r.end_ts)}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Rooms grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        {rooms.map((room) => (
          <RoomCard key={room.id} room={room} onOpen={() => nav(`/salles/${room.id}/reserver`)} />
        ))}
      </div>
    </div>
  );
}

function RoomCard({ room, onOpen }) {
  const equipments = room.equipments || [];
  return (
    <div
      className="ms-card ms-card-hover overflow-hidden flex flex-col cursor-pointer"
      onClick={onOpen}
      data-testid={`room-card-${room.id}`}
    >
      <div className="relative aspect-[16/10] bg-[#F4F7FA]">
        {room.photo_url ? (
          <img
            src={room.photo_url}
            alt={room.name}
            className="w-full h-full object-cover"
            onError={(e) => { e.currentTarget.src = "https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=1200&q=80"; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[#94A3B8]">
            <DoorOpen className="h-10 w-10" />
          </div>
        )}
        <span className={`absolute top-3 left-3 text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full ${STATUS_STYLE[room.status_key] || "bg-emerald-100 text-emerald-800"}`}>
          {room.status_label}
        </span>
      </div>
      <div className="p-4 flex-1 flex flex-col">
        <div className="text-base font-bold text-[#071B34]">{room.name}</div>
        <div className="mt-1 text-xs text-[#475569] flex items-center gap-3">
          <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {room.capacity} pers.</span>
          {room.floor && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {room.floor}</span>}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {equipments.slice(0, 6).map((e) => {
            const Icon = EQUIP_ICON[e] || Zap;
            return (
              <span key={e} title={EQUIP_LABEL[e] || e} className="inline-flex items-center h-6 w-6 rounded-full bg-[#F4F7FA] text-[#475569] justify-center">
                <Icon className="h-3.5 w-3.5" />
              </span>
            );
          })}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onOpen(); }}
          data-testid={`room-open-${room.id}`}
          disabled={!room.is_active}
          className="mt-4 ms-btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {room.is_active ? <>Voir les disponibilités <ChevronRight className="h-4 w-4" /></> : "Indisponible"}
        </button>
      </div>
    </div>
  );
}

// Room detail with duration picker + compatible start slots
function RoomDetail({ room, onClose, onBooked }) {
  const [date, setDate] = useState(todayISODate());
  const [availability, setAvailability] = useState({ reservations: [] });
  const [duration, setDuration] = useState(60); // minutes
  const [customDuration, setCustomDuration] = useState("");
  const [bookingSlot, setBookingSlot] = useState(null);

  const load = () => {
    api.get(`/rooms/${room.id}/availability`, { params: { date } })
      .then((r) => setAvailability(r.data))
      .catch(() => setAvailability({ reservations: [] }));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [date, room.id]);

  const durOptions = [15, 30, 45, 60, 90, 120, 180, 240];

  // Compute start slots every 15 min from 08:00 to 20:00 - duration
  const startSlots = useMemo(() => {
    const rows = [];
    const dayEnd = new Date(`${date}T20:00:00`);
    for (let h = 8; h < 20; h++) {
      for (let m = 0; m < 60; m += 15) {
        const start = new Date(`${date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);
        const end = new Date(start.getTime() + duration * 60000);
        if (end > dayEnd) continue;
        // Overlap check against all reservations
        const conflict = (availability.reservations || []).find(r => {
          const rs = new Date(r.start_ts).getTime();
          const re = new Date(r.end_ts).getTime();
          return start.getTime() < re && end.getTime() > rs;
        });
        const mine = conflict?.is_mine;
        rows.push({ start, end, conflict, mine });
      }
    }
    return rows;
  }, [date, availability, duration]);

  const freeSlots = startSlots.filter(s => !s.conflict);
  const busyReservations = availability.reservations || [];

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-3xl w-full max-w-4xl my-8 overflow-hidden" data-testid="room-detail-modal">
        {/* Header */}
        <div className="relative">
          <img
            src={room.photo_url}
            alt=""
            className="w-full h-40 object-cover bg-[#F4F7FA]"
            onError={(e) => { e.currentTarget.src = "https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=1200&q=80"; }}
          />
          <button onClick={onClose} className="absolute top-3 right-3 h-9 w-9 rounded-full bg-white/90 hover:bg-white inline-flex items-center justify-center shadow" data-testid="room-detail-close">
            <X className="h-4 w-4" />
          </button>
          <div className="absolute inset-x-0 bottom-0 p-5 bg-gradient-to-t from-black/70 to-transparent text-white">
            <div className="text-2xl font-bold">{room.name}</div>
            <div className="text-sm opacity-90 mt-1 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {room.capacity} personnes</span>
              {room.floor && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {room.floor}</span>}
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Step 1 — Duration */}
          <div>
            <div className="text-xs uppercase tracking-widest font-semibold text-[#475569] mb-2">
              1. Durée de votre réunion
            </div>
            <div className="flex flex-wrap gap-2">
              {durOptions.map((d) => {
                const on = duration === d;
                const label = d < 60 ? `${d} min` : d % 60 === 0 ? `${d / 60}h` : `${Math.floor(d / 60)}h${String(d % 60).padStart(2, "0")}`;
                return (
                  <button
                    key={d}
                    onClick={() => { setDuration(d); setCustomDuration(""); }}
                    data-testid={`dur-${d}`}
                    className={`px-3 py-1.5 rounded-full text-sm font-semibold transition ${on ? "bg-[#3BA4FF] text-white" : "bg-[#F4F7FA] hover:bg-[#071B34]/5 text-[#475569]"}`}
                  >
                    {label}
                  </button>
                );
              })}
              <div className="inline-flex items-center gap-1">
                <input
                  type="number"
                  min={15}
                  max={480}
                  step={15}
                  placeholder="Autre (min)"
                  value={customDuration}
                  onChange={(e) => {
                    setCustomDuration(e.target.value);
                    const v = parseInt(e.target.value, 10);
                    if (!Number.isNaN(v) && v >= 15) setDuration(v);
                  }}
                  data-testid="dur-custom"
                  className="w-28 h-9 px-3 rounded-full bg-white ring-1 ring-[#071B34]/10 text-sm outline-none focus:ring-[#3BA4FF]/40"
                />
                <span className="text-xs text-[#94A3B8]">min</span>
              </div>
            </div>
          </div>

          {/* Step 2 — Date + free start slots */}
          <div>
            <div className="text-xs uppercase tracking-widest font-semibold text-[#475569] mb-2 flex items-center gap-3">
              <span>2. Sélectionnez un horaire de début</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                data-testid="room-planning-date"
                className="ms-input py-1 h-8 text-xs"
              />
              <span className="ml-auto text-[10px] text-[#94A3B8]">
                {freeSlots.length} créneau{freeSlots.length > 1 ? "x" : ""} disponible{freeSlots.length > 1 ? "s" : ""}
              </span>
            </div>
            {freeSlots.length === 0 ? (
              <div className="rounded-xl bg-amber-50 text-amber-800 text-sm p-4 text-center">
                Aucun créneau de <b>{duration >= 60 ? `${Math.floor(duration / 60)}h${duration % 60 ? String(duration % 60).padStart(2, "0") : ""}` : `${duration} min`}</b> disponible ce jour. Essayez une autre date ou raccourcissez la durée.
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1.5 max-h-[280px] overflow-y-auto pr-1">
                {freeSlots.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setBookingSlot({ start: s.start.toISOString(), end: s.end.toISOString() })}
                    data-testid={`start-${i}`}
                    className="text-left px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 transition"
                  >
                    <span className="tabular-nums">{s.start.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
                    <span className="ml-1 text-emerald-600 font-normal">→ {s.end.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Existing reservations of the day (compact) */}
          {busyReservations.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-widest font-semibold text-[#475569] mb-2">
                Créneaux déjà réservés
              </div>
              <div className="flex flex-wrap gap-1.5">
                {busyReservations.map((r) => (
                  <span
                    key={r.id}
                    className={`text-[11px] px-2 py-1 rounded-full ${r.is_mine ? "bg-[#3BA4FF]/15 text-[#1D70B8]" : "bg-amber-100 text-amber-800"}`}
                    data-testid={`busy-${r.id}`}
                  >
                    {new Date(r.start_ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} – {new Date(r.end_ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                    {r.is_mine ? " · Votre réservation" : ` · ${r.title || "Occupé"}`}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {bookingSlot && (
          <BookingForm
            room={room}
            initialStart={bookingSlot.start}
            initialEnd={bookingSlot.end}
            onCancel={() => setBookingSlot(null)}
            onDone={() => { setBookingSlot(null); onBooked?.(); }}
          />
        )}
      </div>
    </div>
  );
}

function BookingForm({ room, initialStart, initialEnd, onCancel, onDone, existing = null }) {
  const { employees, me } = useApp();
  const [title, setTitle] = useState(existing?.title || "");
  const [meetingType, setMeetingType] = useState(existing?.meeting_type || "team");
  const [startISO, setStartISO] = useState(initialStart);
  const [endISO, setEndISO] = useState(initialEnd);
  const [participants, setParticipants] = useState(existing?.participants_ids || []);
  const [participantsCount, setParticipantsCount] = useState(existing?.participants_count || 1);
  const [description, setDescription] = useState(existing?.description || "");
  const [equipments, setEquipments] = useState(existing?.equipments_needed || []);
  const [specialRequest, setSpecialRequest] = useState(existing?.special_request || "");
  const [saving, setSaving] = useState(false);
  const [empQ, setEmpQ] = useState("");

  const durationMin = useMemo(() => {
    const d = (new Date(endISO).getTime() - new Date(startISO).getTime()) / 60000;
    return Math.max(0, Math.round(d));
  }, [startISO, endISO]);

  const capacityWarning = participantsCount > room.capacity;

  const toISOFromLocal = (dt) => new Date(dt).toISOString();
  const isoToLocalInput = (iso) => {
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const filteredEmps = (employees || []).filter((e) => e.id !== me?.id && !e.is_super_admin && `${e.first_name} ${e.last_name}`.toLowerCase().includes(empQ.toLowerCase()));

  const save = async () => {
    if (!title.trim()) { toast.error("Titre requis"); return; }
    setSaving(true);
    try {
      const body = {
        room_id: room.id,
        title: title.trim(),
        meeting_type: meetingType,
        start_ts: startISO,
        end_ts: endISO,
        participants_ids: participants,
        participants_count: Number(participantsCount) || participants.length + 1,
        description,
        equipments_needed: equipments,
        special_request: specialRequest,
      };
      if (existing) {
        await api.put(`/reservations/${existing.id}`, body);
        toast.success("Réservation modifiée");
      } else {
        await api.post("/reservations", body);
        toast.success("Réservation confirmée");
      }
      onDone?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Impossible de réserver");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-t border-[#071B34]/5 p-6 bg-[#F8FAFC]" data-testid="booking-form">
      <div className="text-xs uppercase tracking-widest font-semibold text-[#475569] mb-3">
        {existing ? "Modifier la réservation" : "Compléter la réservation"}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <div>
            <label className="ms-overline">Titre *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="ms-input mt-1" placeholder="Ex : Point équipe hebdo" data-testid="booking-title" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="ms-overline">Début</label>
              <input type="datetime-local" value={isoToLocalInput(startISO)} onChange={(e) => setStartISO(toISOFromLocal(e.target.value))} className="ms-input mt-1" data-testid="booking-start" step={900} />
            </div>
            <div>
              <label className="ms-overline">Fin</label>
              <input type="datetime-local" value={isoToLocalInput(endISO)} onChange={(e) => setEndISO(toISOFromLocal(e.target.value))} className="ms-input mt-1" data-testid="booking-end" step={900} />
            </div>
          </div>
          <div className="text-xs text-[#475569]">Durée : <span className="font-bold text-[#071B34]">{Math.floor(durationMin / 60)}h {String(durationMin % 60).padStart(2, "0")}</span></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="ms-overline">Type</label>
              <select value={meetingType} onChange={(e) => setMeetingType(e.target.value)} className="ms-input mt-1" data-testid="booking-type">
                {MEETING_TYPES.map((t) => <option key={t.k} value={t.k}>{t.l}</option>)}
              </select>
            </div>
            <div>
              <label className="ms-overline">Nombre de participants</label>
              <input type="number" min={1} value={participantsCount} onChange={(e) => setParticipantsCount(e.target.value)} className="ms-input mt-1" data-testid="booking-count" />
              {capacityWarning && (
                <div className="mt-1 text-[11px] text-amber-700 font-semibold" data-testid="booking-capacity-warning">
                  ⚠ La salle est limitée à {room.capacity} personnes.
                </div>
              )}
            </div>
          </div>
          <div>
            <label className="ms-overline">Description / ordre du jour</label>
            <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className="ms-input mt-1 resize-y" data-testid="booking-description" />
          </div>
          <div>
            <label className="ms-overline">Participants internes</label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8]" />
              <input value={empQ} onChange={(e) => setEmpQ(e.target.value)} placeholder="Rechercher un collègue…" className="w-full h-10 pl-9 pr-3 rounded-xl bg-white ring-1 ring-[#071B34]/10 outline-none text-sm" data-testid="booking-participant-search" />
            </div>
            <div className="mt-2 max-h-40 overflow-y-auto space-y-1 pr-1">
              {filteredEmps.slice(0, 20).map((e) => {
                const on = participants.includes(e.id);
                return (
                  <button key={e.id} onClick={() => setParticipants((p) => on ? p.filter(x => x !== e.id) : [...p, e.id])} className={`w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${on ? "bg-[#3BA4FF]/10 text-[#1D70B8] font-semibold" : "hover:bg-white text-[#334155]"}`} data-testid={`booking-part-${e.id}`}>
                    <span className="flex-1 text-left truncate">{e.first_name} {e.last_name} <span className="text-[10px] text-[#94A3B8]">· {e.role || "—"}</span></span>
                    {on && <Check className="h-4 w-4" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="ms-overline">Équipements nécessaires</label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {Object.entries(EQUIP_LABEL).map(([k, l]) => {
                const on = equipments.includes(k);
                return (
                  <button key={k} onClick={() => setEquipments((s) => on ? s.filter(x => x !== k) : [...s, k])} className={`px-2 py-1 rounded-full text-[11px] font-semibold ${on ? "bg-[#3BA4FF] text-white" : "bg-white ring-1 ring-[#071B34]/10 text-[#475569]"}`} data-testid={`booking-eq-${k}`}>
                    {l}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="ms-overline">Demande particulière</label>
            <textarea rows={3} value={specialRequest} onChange={(e) => setSpecialRequest(e.target.value)} className="ms-input mt-1 resize-y" data-testid="booking-special" placeholder="Ex : disposition en U, café pour 8 personnes…" />
          </div>
          <div className="rounded-xl bg-white ring-1 ring-[#071B34]/10 p-3 text-xs text-[#475569]">
            <div className="font-semibold text-[#071B34]">Récapitulatif</div>
            <div className="mt-1">Salle : <b>{room.name}</b></div>
            <div>Horaire : <b>{formatTime(startISO)} – {formatTime(endISO)}</b></div>
            <div>Durée : <b>{Math.floor(durationMin / 60)}h {String(durationMin % 60).padStart(2, "0")}</b></div>
            <div>Participants : <b>{participantsCount}</b></div>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 mt-4">
        <button onClick={onCancel} className="px-4 py-2 rounded-xl text-sm text-[#475569] hover:bg-white" data-testid="booking-cancel">
          Annuler
        </button>
        <button onClick={save} disabled={saving} className="ms-btn-primary" data-testid="booking-save">
          {saving ? "Enregistrement…" : (existing ? "Enregistrer les modifications" : "Confirmer la réservation")}
        </button>
      </div>
    </div>
  );
}

function MyReservationsPanel({ onClose, onChanged }) {
  const [tab, setTab] = useState("upcoming");
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);

  const load = () => {
    api.get(`/reservations?scope=${tab}`).then((r) => setItems(r.data)).catch(() => setItems([]));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tab]);

  const cancel = async (r) => {
    const reason = window.prompt("Motif d'annulation (optionnel) :", "");
    if (reason === null) return;
    try {
      await api.post(`/reservations/${r.id}/cancel`, { reason });
      toast.success("Réservation annulée");
      load(); onChanged?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Impossible d'annuler");
    }
  };

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-3xl w-full max-w-4xl my-8 overflow-hidden" data-testid="my-reservations-modal">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#071B34]/5">
          <h3 className="text-base font-bold text-[#071B34]">Mes réservations</h3>
          <button onClick={onClose} className="h-9 w-9 rounded-lg hover:bg-[#F4F7FA] inline-flex items-center justify-center" data-testid="my-reservations-close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 pt-3 border-b border-[#071B34]/5 flex gap-4">
          {[
            { k: "upcoming", l: "À venir" },
            { k: "history", l: "Historique" },
          ].map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)} data-testid={`my-tab-${t.k}`} className={`pb-3 text-sm font-semibold ${tab === t.k ? "text-[#3BA4FF] border-b-2 border-[#3BA4FF]" : "text-[#475569]"}`}>
              {t.l}
            </button>
          ))}
        </div>
        <div className="p-5 space-y-2">
          {items.length === 0 && <div className="text-center text-sm text-[#475569] py-8">Aucune réservation.</div>}
          {items.map((r) => (
            <div key={r.id} className="rounded-xl ring-1 ring-[#071B34]/10 p-3 flex items-center gap-3" data-testid={`my-res-${r.id}`}>
              {r.room_photo && <img src={r.room_photo} alt="" className="h-14 w-14 rounded-lg object-cover shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-[#071B34] truncate">{r.title}</div>
                <div className="text-xs text-[#475569] truncate">
                  {r.room_name} · {formatDT(r.start_ts)} – {formatTime(r.end_ts)}
                  {r.status === "cancelled" && <span className="ml-2 text-red-600 font-semibold">· Annulée</span>}
                </div>
              </div>
              {r.status !== "cancelled" && new Date(r.end_ts) >= new Date() && (
                <>
                  <button onClick={() => setEditing(r)} title="Modifier" className="h-8 w-8 rounded-lg hover:bg-[#F4F7FA] inline-flex items-center justify-center text-[#3BA4FF]" data-testid={`my-edit-${r.id}`}>
                    <Edit3 className="h-4 w-4" />
                  </button>
                  <button onClick={() => cancel(r)} title="Annuler" className="h-8 w-8 rounded-lg hover:bg-[#FEE2E2] inline-flex items-center justify-center text-[#B91C1C]" data-testid={`my-cancel-${r.id}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
        {editing && (
          <div className="border-t border-[#071B34]/5">
            <BookingForm
              room={{ id: editing.room_id, name: editing.room_name, capacity: 999, photo_url: editing.room_photo }}
              initialStart={editing.start_ts}
              initialEnd={editing.end_ts}
              existing={editing}
              onCancel={() => setEditing(null)}
              onDone={() => { setEditing(null); load(); onChanged?.(); }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
