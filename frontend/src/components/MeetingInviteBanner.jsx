import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar, X, Check, Users, MapPin, Clock } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";

// Detects pending meeting invitations for the current user and opens a
// centered confirmation popup. Once responded (or postponed), the popup
// closes and the next pending invite (if any) is shown.
export default function MeetingInviteBanner() {
  const { me, employees } = useApp();
  const [pending, setPending] = useState(null);
  // Locally remember invites the user has dismissed (postponed) so they
  // don't reopen on every poll cycle in the same session.
  const [snoozed, setSnoozed] = useState(() => new Set());
  const nav = useNavigate();

  const check = useCallback(async () => {
    if (!me?.id) return;
    try {
      const { data } = await api.get("/reservations?scope=upcoming");
      const invite = (data || []).find((r) =>
        r.organizer_id !== me.id &&
        (r.participants_ids || []).includes(me.id) &&
        ((r.participant_responses || {})[me.id] || "pending") === "pending" &&
        !snoozed.has(r.id) &&
        r.status !== "cancelled"
      );
      setPending(invite || null);
    } catch { /* ignore */ }
  }, [me?.id, snoozed]);

  useEffect(() => {
    check();
    const t = setInterval(check, 30_000);
    const onNotif = () => check();
    window.addEventListener("ms-notifications-refresh", onNotif);
    return () => { clearInterval(t); window.removeEventListener("ms-notifications-refresh", onNotif); };
  }, [check]);

  const respond = async (response) => {
    if (!pending) return;
    try {
      await api.post(`/reservations/${pending.id}/respond`, { response });
      toast.success(
        response === "confirmed"
          ? "Présence confirmée · Ajouté à votre agenda"
          : "Vous avez décliné cette invitation"
      );
      setPending(null);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Impossible d'envoyer la réponse");
    }
  };

  const postpone = () => {
    if (!pending) return;
    setSnoozed((s) => new Set([...s, pending.id]));
    setPending(null);
  };

  if (!pending) return null;

  // Organizer info for the "De la part de …" line
  const organizerEmp = (employees || []).find((e) => e.id === pending.organizer_id);
  const organizerName = organizerEmp
    ? `${organizerEmp.first_name || ""} ${organizerEmp.last_name || ""}`.trim()
    : "Un(e) collègue";

  const start = new Date(pending.start_ts);
  const end = new Date(pending.end_ts);
  const dateLabel = start.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const timeLabel = `${start.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} – ${end.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" data-testid="meeting-invite-modal">
      <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="relative bg-gradient-to-br from-[#3BA4FF] to-[#4338CA] p-5 text-white">
          <button
            onClick={postpone}
            data-testid="meeting-invite-close"
            className="absolute top-3 right-3 h-8 w-8 rounded-lg hover:bg-white/15 inline-flex items-center justify-center"
            aria-label="Répondre plus tard"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="inline-flex items-center gap-2 text-xs uppercase tracking-widest font-semibold opacity-90 mb-2">
            <Calendar className="h-3.5 w-3.5" /> Nouvelle invitation
          </div>
          <h3 className="text-xl font-bold" data-testid="meeting-invite-title">{pending.title}</h3>
          <div className="mt-2 text-xs opacity-90 flex items-center gap-2" data-testid="meeting-invite-from">
            {organizerEmp?.avatar && (
              <img src={organizerEmp.avatar} alt="" className="h-6 w-6 rounded-full object-cover ring-2 ring-white/40" />
            )}
            <span>De la part de <b>{organizerName}</b>{organizerEmp?.role ? ` · ${organizerEmp.role}` : ""}</span>
          </div>
        </div>

        <div className="p-5 space-y-3">
          <div className="text-sm text-[#334155] space-y-2">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-[#94A3B8] shrink-0" />
              <span className="capitalize">{dateLabel}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-[#94A3B8] shrink-0" />
              <span>{timeLabel}</span>
            </div>
            {pending.room_name && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-[#94A3B8] shrink-0" />
                <span>{pending.room_name}{pending.room_floor ? ` · ${pending.room_floor}` : ""}</span>
              </div>
            )}
            {pending.participants_count > 0 && (
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-[#94A3B8] shrink-0" />
                <span>{pending.participants_count} participant{pending.participants_count > 1 ? "s" : ""}</span>
              </div>
            )}
          </div>
          {pending.description && (
            <div className="rounded-xl bg-[#F8FAFC] p-3 text-xs text-[#475569] whitespace-pre-wrap">
              {pending.description}
            </div>
          )}
          <p className="text-xs text-[#475569]">
            Confirmez-vous votre présence ? Si oui, la réunion sera ajoutée automatiquement à votre agenda.
          </p>
        </div>

        <div className="px-5 py-4 border-t border-[#071B34]/5 flex flex-col sm:flex-row items-center gap-2">
          <button
            onClick={postpone}
            data-testid="meeting-invite-later"
            className="w-full sm:w-auto px-4 py-2 rounded-xl text-sm text-[#475569] hover:bg-[#F4F7FA]"
          >
            Plus tard
          </button>
          <div className="hidden sm:block flex-1" />
          <button
            onClick={() => respond("declined")}
            data-testid="meeting-invite-decline"
            className="w-full sm:w-auto px-4 py-2 rounded-xl text-sm font-semibold bg-[#FEE2E2] hover:bg-[#FCA5A5] text-[#B91C1C]"
          >
            Non, décliner
          </button>
          <button
            onClick={() => respond("confirmed")}
            data-testid="meeting-invite-accept"
            className="w-full sm:w-auto ms-btn-primary"
          >
            <Check className="h-4 w-4" /> Oui, je viens
          </button>
        </div>
      </div>
    </div>
  );
}
