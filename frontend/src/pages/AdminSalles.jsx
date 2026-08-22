import { useEffect, useState } from "react";
import { DoorOpen, Plus, Edit3, Trash2, X, Users, MapPin } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

const EQUIPMENT_OPTIONS = [
  ["screen", "Écran de présentation"],
  ["video", "Visioconférence"],
  ["whiteboard", "Tableau blanc"],
  ["power", "Prises électriques"],
  ["wifi", "Connexion Wi-Fi"],
  ["audio", "Système audio"],
  ["hdmi", "Câble HDMI"],
  ["paperboard", "Paperboard"],
  ["computer", "Ordinateur"],
  ["adapter", "Adaptateur"],
  ["water", "Bouteilles d'eau"],
  ["coffee", "Café"],
  ["microphone", "Micro"],
];

const empty = {
  name: "", capacity: 8, floor: "", equipments: [],
  photo_url: "", description: "", is_active: true, maintenance_note: "",
};

export default function AdminSalles() {
  const [rooms, setRooms] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [editing, setEditing] = useState(null);
  const [tab, setTab] = useState("rooms"); // rooms | reservations

  const load = () => {
    api.get("/rooms").then((r) => setRooms(r.data)).catch(() => {});
    api.get("/admin/reservations?scope=upcoming").then((r) => setReservations(r.data)).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const remove = async (id) => {
    if (!window.confirm("Supprimer cette salle ? Les réservations existantes ne seront pas supprimées.")) return;
    try { await api.delete(`/admin/rooms/${id}`); toast.success("Salle supprimée"); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Erreur"); }
  };

  return (
    <div className="ms-fade-up">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-[#071B34] tracking-tight flex items-center gap-2">
            <DoorOpen className="h-7 w-7 text-[#3BA4FF]" />
            Gestion des salles de réunion
          </h1>
          <p className="text-sm text-[#475569] mt-1">Créez, modifiez et pilotez toutes les réservations.</p>
        </div>
        {tab === "rooms" && (
          <button onClick={() => setEditing({ ...empty })} className="ms-btn-primary" data-testid="admin-rooms-add">
            <Plus className="h-4 w-4" /> Nouvelle salle
          </button>
        )}
      </div>

      <div className="border-b border-[#071B34]/5 mb-5 flex gap-4">
        {[{ k: "rooms", l: `Salles (${rooms.length})` }, { k: "reservations", l: `Réservations (${reservations.length})` }].map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)} data-testid={`admin-tab-${t.k}`} className={`pb-3 text-sm font-semibold ${tab === t.k ? "text-[#3BA4FF] border-b-2 border-[#3BA4FF]" : "text-[#475569]"}`}>
            {t.l}
          </button>
        ))}
      </div>

      {tab === "rooms" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {rooms.map((r) => (
            <div key={r.id} className="ms-card overflow-hidden" data-testid={`admin-room-${r.id}`}>
              <img src={r.photo_url} alt="" className="w-full h-32 object-cover" />
              <div className="p-4">
                <div className="text-base font-bold text-[#071B34]">{r.name}</div>
                <div className="text-xs text-[#475569] mt-1 flex gap-3">
                  <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {r.capacity}</span>
                  {r.floor && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {r.floor}</span>}
                  {!r.is_active && <span className="text-red-600 font-semibold">· Désactivée</span>}
                </div>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => setEditing({ ...r })} className="ms-btn-secondary flex-1" data-testid={`admin-room-edit-${r.id}`}>
                    <Edit3 className="h-3.5 w-3.5" /> Modifier
                  </button>
                  <button onClick={() => remove(r.id)} className="h-9 w-9 rounded-xl bg-[#FEE2E2] hover:bg-[#FCA5A5] text-[#B91C1C] inline-flex items-center justify-center" data-testid={`admin-room-del-${r.id}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="ms-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#F4F7FA] text-[10px] uppercase tracking-widest text-[#475569]">
              <tr>
                <th className="px-4 py-3 text-left">Salle</th>
                <th className="px-4 py-3 text-left">Titre</th>
                <th className="px-4 py-3 text-left">Horaire</th>
                <th className="px-4 py-3 text-left">Organisateur</th>
                <th className="px-4 py-3 text-left">Participants</th>
              </tr>
            </thead>
            <tbody>
              {reservations.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-[#94A3B8]">Aucune réservation à venir.</td></tr>
              )}
              {reservations.map((r) => (
                <tr key={r.id} className="border-t border-[#071B34]/5" data-testid={`admin-res-${r.id}`}>
                  <td className="px-4 py-3 font-semibold text-[#071B34]">{r.room_name}</td>
                  <td className="px-4 py-3">{r.title}</td>
                  <td className="px-4 py-3 text-[#475569]">
                    {new Date(r.start_ts).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    {" → "}
                    {new Date(r.end_ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="px-4 py-3 text-[#475569]">{r.organizer_id}</td>
                  <td className="px-4 py-3 text-[#475569]">{r.participants_count || (r.participants_ids || []).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <RoomEditor room={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </div>
  );
}

function RoomEditor({ room, onClose, onSaved }) {
  const [form, setForm] = useState({ ...room });
  const [saving, setSaving] = useState(false);
  const isNew = !room.id;

  const toggleEq = (k) =>
    setForm((f) => ({ ...f, equipments: (f.equipments || []).includes(k) ? f.equipments.filter(x => x !== k) : [...(f.equipments || []), k] }));

  const save = async () => {
    if (!form.name?.trim()) { toast.error("Nom requis"); return; }
    setSaving(true);
    try {
      const body = { ...form, capacity: Number(form.capacity) || 1 };
      if (isNew) await api.post("/admin/rooms", body);
      else await api.put(`/admin/rooms/${room.id}`, body);
      toast.success(isNew ? "Salle créée" : "Salle modifiée");
      onSaved?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erreur");
    } finally { setSaving(false); }
  };

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-3xl w-full max-w-2xl my-8 overflow-hidden" data-testid="admin-room-modal">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#071B34]/5">
          <h3 className="text-base font-bold text-[#071B34]">{isNew ? "Créer une salle" : "Modifier la salle"}</h3>
          <button onClick={onClose} className="h-9 w-9 rounded-lg hover:bg-[#F4F7FA] inline-flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="ms-overline">Nom *</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="ms-input mt-1" data-testid="admin-room-name" />
            </div>
            <div>
              <label className="ms-overline">Capacité</label>
              <input type="number" min={1} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} className="ms-input mt-1" data-testid="admin-room-capacity" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="ms-overline">Étage / emplacement</label>
              <input value={form.floor || ""} onChange={(e) => setForm({ ...form, floor: e.target.value })} className="ms-input mt-1" placeholder="Ex : 2ᵉ étage" data-testid="admin-room-floor" />
            </div>
            <div>
              <label className="ms-overline">Photo (URL)</label>
              <input value={form.photo_url || ""} onChange={(e) => setForm({ ...form, photo_url: e.target.value })} className="ms-input mt-1" placeholder="https://…" data-testid="admin-room-photo" />
            </div>
          </div>
          <div>
            <label className="ms-overline">Description</label>
            <textarea rows={2} value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} className="ms-input mt-1 resize-y" data-testid="admin-room-desc" />
          </div>
          <div>
            <label className="ms-overline">Équipements</label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {EQUIPMENT_OPTIONS.map(([k, l]) => {
                const on = (form.equipments || []).includes(k);
                return (
                  <button key={k} onClick={() => toggleEq(k)} className={`px-2 py-1 rounded-full text-[11px] font-semibold ${on ? "bg-[#3BA4FF] text-white" : "bg-[#F4F7FA] text-[#475569]"}`} data-testid={`admin-room-eq-${k}`}>
                    {l}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={!!form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="h-4 w-4 accent-[#3BA4FF]" data-testid="admin-room-active" />
            <span className="text-sm text-[#334155]">Salle disponible à la réservation</span>
          </label>
          {!form.is_active && (
            <div>
              <label className="ms-overline">Note de maintenance</label>
              <input value={form.maintenance_note || ""} onChange={(e) => setForm({ ...form, maintenance_note: e.target.value })} className="ms-input mt-1" placeholder="Ex : peinture en cours jusqu'au…" />
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-[#071B34]/5 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded-xl text-sm text-[#475569] hover:bg-[#F4F7FA]">Annuler</button>
          <button onClick={save} disabled={saving} className="ms-btn-primary" data-testid="admin-room-save">
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}
