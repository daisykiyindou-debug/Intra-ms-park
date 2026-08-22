import { useEffect, useMemo, useRef, useState } from "react";
import {
  DoorOpen, Plus, Edit3, Trash2, X, Users, MapPin, Check, Sun, Calendar,
  Upload, Image as ImageIcon, ChevronLeft, ChevronRight, Eye, Wrench,
  Sparkles, XCircle, Ban, CheckCircle2,
} from "lucide-react";
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
  ["microphone", "Micro"],
];
const SERVICE_OPTIONS = [
  ["coffee", "Café"],
  ["water", "Bouteilles d'eau"],
  ["snacks", "Encas"],
  ["catering", "Buffet / Traiteur"],
  ["u-setup", "Disposition en U"],
  ["theater-setup", "Disposition théâtre"],
  ["cleaning", "Nettoyage entre réunions"],
  ["reception", "Accueil visiteurs"],
];
const STATUS_META = {
  available: { l: "Disponible", cls: "bg-emerald-100 text-emerald-800" },
  maintenance: { l: "Maintenance", cls: "bg-red-100 text-red-800" },
  unavailable: { l: "Indisponible", cls: "bg-slate-200 text-slate-700" },
};
const DEFAULT_PHOTO = "https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=1200&q=80";

const empty = {
  name: "", capacity: 8, floor: "", building: "", zone: "", room_number: "",
  equipments: [], services: [],
  photo_url: "", photos: [],
  description: "",
  min_duration_minutes: 15,
  status: "available",
  is_active: true,
  maintenance_note: "",
};

export default function AdminSalles() {
  const [rooms, setRooms] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [stats, setStats] = useState(null);
  const [editing, setEditing] = useState(null);
  const [tab, setTab] = useState("dashboard"); // dashboard | rooms | reservations

  const load = () => {
    api.get("/rooms").then((r) => setRooms(r.data)).catch(() => {});
    api.get("/admin/reservations?scope=upcoming").then((r) => setReservations(r.data)).catch(() => {});
    api.get("/admin/rooms/stats").then((r) => setStats(r.data)).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const remove = async (id) => {
    if (!window.confirm("Supprimer cette salle ? Les réservations existantes ne seront pas supprimées.")) return;
    try { await api.delete(`/admin/rooms/${id}`); toast.success("Salle supprimée"); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Erreur"); }
  };

  const quickToggleStatus = async (room, newStatus) => {
    try {
      await api.put(`/admin/rooms/${room.id}`, {
        ...room,
        status: newStatus,
        is_active: newStatus === "available",
      });
      toast.success(`Salle passée en ${STATUS_META[newStatus]?.l || newStatus}`);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Erreur"); }
  };

  return (
    <div className="ms-fade-up">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-[#071B34] tracking-tight flex items-center gap-2">
            <DoorOpen className="h-7 w-7 text-[#A78BFA]" />
            Gestion des salles de réunion
          </h1>
          <p className="text-sm text-[#475569] mt-1">Créez, publiez et pilotez toutes les salles + leurs réservations.</p>
        </div>
        {tab === "rooms" && (
          <button onClick={() => setEditing({ ...empty })} className="ms-btn-primary" data-testid="admin-rooms-add">
            <Plus className="h-4 w-4" /> Créer une nouvelle salle
          </button>
        )}
      </div>

      <div className="border-b border-[#071B34]/5 mb-5 flex gap-4">
        {[
          { k: "dashboard", l: "Tableau de bord" },
          { k: "rooms", l: `Salles (${rooms.length})` },
          { k: "reservations", l: `Réservations (${reservations.length})` },
        ].map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)} data-testid={`admin-tab-${t.k}`}
            className={`pb-3 text-sm font-semibold ${tab === t.k ? "text-[#A78BFA] border-b-2 border-[#A78BFA]" : "text-[#475569]"}`}>
            {t.l}
          </button>
        ))}
      </div>

      {tab === "dashboard" && <Dashboard stats={stats} rooms={rooms} onQuickStatus={quickToggleStatus} />}

      {tab === "rooms" && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {rooms.map((r) => (
            <div key={r.id} className="ms-card overflow-hidden" data-testid={`admin-room-${r.id}`}>
              <img
                src={(r.photos && r.photos[0]) || r.photo_url || DEFAULT_PHOTO}
                alt=""
                onError={(e) => { e.currentTarget.src = DEFAULT_PHOTO; }}
                className="w-full h-32 object-cover"
              />
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-base font-bold text-[#071B34]">{r.name}</div>
                    <div className="text-xs text-[#475569] mt-1 flex gap-3 flex-wrap">
                      <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {r.capacity}</span>
                      {r.floor && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {r.floor}</span>}
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full ${STATUS_META[r.status || (r.is_active ? "available" : "unavailable")]?.cls || STATUS_META.available.cls}`}>
                    {STATUS_META[r.status || (r.is_active ? "available" : "unavailable")]?.l || "Disponible"}
                  </span>
                </div>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => setEditing({ ...r })} className="ms-btn-secondary flex-1" data-testid={`admin-room-edit-${r.id}`}>
                    <Edit3 className="h-3.5 w-3.5" /> Modifier
                  </button>
                  {r.status !== "maintenance" ? (
                    <button onClick={() => quickToggleStatus(r, "maintenance")} title="Passer en maintenance"
                      className="h-9 w-9 rounded-xl bg-[#FEF3C7] hover:bg-[#FDE68A] text-[#B45309] inline-flex items-center justify-center" data-testid={`admin-room-maint-${r.id}`}>
                      <Wrench className="h-4 w-4" />
                    </button>
                  ) : (
                    <button onClick={() => quickToggleStatus(r, "available")} title="Réactiver"
                      className="h-9 w-9 rounded-xl bg-[#DCFCE7] hover:bg-[#BBF7D0] text-[#166534] inline-flex items-center justify-center">
                      <CheckCircle2 className="h-4 w-4" />
                    </button>
                  )}
                  <button onClick={() => remove(r.id)} className="h-9 w-9 rounded-xl bg-[#FEE2E2] hover:bg-[#FCA5A5] text-[#B91C1C] inline-flex items-center justify-center" data-testid={`admin-room-del-${r.id}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "reservations" && (
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

function Dashboard({ stats, rooms, onQuickStatus }) {
  const cards = [
    { l: "Réservations aujourd'hui", v: stats?.today_reservations ?? "—", icon: Calendar, tint: "bg-[#3BA4FF]/10 text-[#1D70B8]" },
    { l: "Salles occupées", v: stats?.busy_rooms ?? "—", icon: Users, tint: "bg-amber-100 text-amber-800" },
    { l: "Salles libres", v: stats?.free_rooms ?? "—", icon: CheckCircle2, tint: "bg-emerald-100 text-emerald-800" },
    { l: "Salles indisponibles", v: stats?.maintenance_rooms ?? "—", icon: Wrench, tint: "bg-red-100 text-red-800" },
    { l: "Annulations aujourd'hui", v: stats?.cancelled_today ?? "—", icon: XCircle, tint: "bg-slate-200 text-slate-700" },
  ];
  return (
    <div className="space-y-5" data-testid="admin-dashboard">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {cards.map((c) => (
          <div key={c.l} className="ms-card p-4">
            <div className={`h-9 w-9 rounded-xl inline-flex items-center justify-center mb-2 ${c.tint}`}>
              <c.icon className="h-4 w-4" />
            </div>
            <div className="text-2xl font-bold text-[#071B34] tabular-nums">{c.v}</div>
            <div className="text-[11px] text-[#475569] mt-0.5 uppercase tracking-widest font-semibold">{c.l}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="ms-card p-5">
          <div className="text-xs uppercase tracking-widest font-semibold text-[#475569] mb-3">Prochaines réunions</div>
          {!stats?.upcoming?.length ? (
            <div className="text-sm text-[#94A3B8] py-6 text-center">Aucune réunion à venir.</div>
          ) : (
            <div className="space-y-2">
              {stats.upcoming.map((u) => (
                <div key={u.id} className="rounded-xl bg-[#F8FAFC] p-3">
                  <div className="text-sm font-bold text-[#071B34]">{u.title}</div>
                  <div className="text-xs text-[#475569] mt-0.5">
                    {u.room_name} · {new Date(u.start_ts).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} → {new Date(u.end_ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="ms-card p-5">
          <div className="text-xs uppercase tracking-widest font-semibold text-[#475569] mb-3">État actuel des salles</div>
          <div className="space-y-2">
            {rooms.map((r) => {
              const status = r.status || (r.is_active ? "available" : "unavailable");
              return (
                <div key={r.id} className="flex items-center gap-3 rounded-xl bg-[#F8FAFC] p-2">
                  <img src={(r.photos?.[0]) || r.photo_url || DEFAULT_PHOTO} onError={(e) => { e.currentTarget.src = DEFAULT_PHOTO; }} alt="" className="h-10 w-14 rounded-lg object-cover shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-[#071B34] truncate">{r.name}</div>
                    <div className="text-[11px] text-[#475569]">{r.floor || "—"} · {r.capacity} pers.</div>
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full ${STATUS_META[status]?.cls}`}>
                    {STATUS_META[status]?.l}
                  </span>
                  {status === "maintenance" ? (
                    <button onClick={() => onQuickStatus(r, "available")} className="h-7 w-7 rounded-lg bg-white hover:bg-emerald-50 inline-flex items-center justify-center text-emerald-700" title="Réactiver">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <button onClick={() => onQuickStatus(r, "maintenance")} className="h-7 w-7 rounded-lg bg-white hover:bg-amber-50 inline-flex items-center justify-center text-amber-700" title="Maintenance">
                      <Wrench className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function RoomEditor({ room, onClose, onSaved }) {
  const [form, setForm] = useState({ ...empty, ...room });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(false);
  const [carouselIdx, setCarouselIdx] = useState(0);
  const isNew = !room.id;
  const mainFileRef = useRef(null);
  const galleryFileRef = useRef(null);

  const toggleArr = (key, k) =>
    setForm((f) => ({ ...f, [key]: (f[key] || []).includes(k) ? f[key].filter(x => x !== k) : [...(f[key] || []), k] }));

  const uploadFile = async (file) => {
    const fd = new FormData();
    fd.append("file", file);
    const r = await api.post("/uploads", fd, { headers: { "Content-Type": "multipart/form-data" } });
    return r.data.url;
  };

  const onMainUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadFile(file);
      setForm((f) => ({ ...f, photo_url: url, photos: (f.photos && f.photos.length > 0) ? f.photos : [url] }));
    } catch { toast.error("Upload impossible"); }
    finally { setUploading(false); e.target.value = ""; }
  };
  const onGalleryUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      const urls = await Promise.all(files.map(uploadFile));
      setForm((f) => ({ ...f, photos: [...(f.photos || []), ...urls] }));
    } catch { toast.error("Upload impossible"); }
    finally { setUploading(false); e.target.value = ""; }
  };
  const removePhoto = (i) =>
    setForm((f) => ({ ...f, photos: (f.photos || []).filter((_, idx) => idx !== i) }));

  const save = async () => {
    if (!form.name?.trim()) { toast.error("Nom requis"); return; }
    setSaving(true);
    try {
      const body = {
        ...form,
        capacity: Number(form.capacity) || 1,
        min_duration_minutes: Number(form.min_duration_minutes) || 15,
        // Sync is_active from status
        is_active: form.status === "available",
      };
      if (isNew) await api.post("/admin/rooms", body);
      else await api.put(`/admin/rooms/${room.id}`, body);
      toast.success(isNew ? "Salle publiée" : "Salle mise à jour");
      onSaved?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erreur");
    } finally { setSaving(false); }
  };

  const photos = form.photos && form.photos.length > 0 ? form.photos : (form.photo_url ? [form.photo_url] : []);
  const statusMeta = STATUS_META[form.status] || STATUS_META.available;

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-3xl w-full max-w-5xl my-8 overflow-hidden" data-testid="admin-room-modal">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#071B34]/5">
          <div>
            <h3 className="text-base font-bold text-[#071B34]">{isNew ? "Créer une nouvelle salle" : "Modifier la salle"}</h3>
            <p className="text-xs text-[#475569] mt-0.5">Toute modification est instantanément visible côté employé.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setPreview((p) => !p)} className="ms-btn-secondary" data-testid="admin-room-preview">
              <Eye className="h-4 w-4" /> {preview ? "Éditer" : "Aperçu employé"}
            </button>
            <button onClick={onClose} className="h-9 w-9 rounded-lg hover:bg-[#F4F7FA] inline-flex items-center justify-center">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {preview ? (
          <PreviewCard form={form} photos={photos} />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 max-h-[70vh] overflow-y-auto">
            <div className="p-5 space-y-4 border-r border-[#071B34]/5">
              <div>
                <label className="ms-overline">Nom de la salle *</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="ms-input mt-1" placeholder="Ex : Salle Horizon" data-testid="admin-room-name" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="ms-overline">Bâtiment</label>
                  <input value={form.building || ""} onChange={(e) => setForm({ ...form, building: e.target.value })} className="ms-input mt-1" placeholder="Ex : Bureaux" data-testid="admin-room-building" />
                </div>
                <div>
                  <label className="ms-overline">Étage</label>
                  <input value={form.floor || ""} onChange={(e) => setForm({ ...form, floor: e.target.value })} className="ms-input mt-1" placeholder="Ex : 2ᵉ étage" data-testid="admin-room-floor" />
                </div>
                <div>
                  <label className="ms-overline">Zone</label>
                  <input value={form.zone || ""} onChange={(e) => setForm({ ...form, zone: e.target.value })} className="ms-input mt-1" placeholder="Ex : Aile Est" data-testid="admin-room-zone" />
                </div>
                <div>
                  <label className="ms-overline">Numéro</label>
                  <input value={form.room_number || ""} onChange={(e) => setForm({ ...form, room_number: e.target.value })} className="ms-input mt-1" placeholder="Ex : 204" data-testid="admin-room-number" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="ms-overline">Capacité maximale</label>
                  <input type="number" min={1} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} className="ms-input mt-1" data-testid="admin-room-capacity" />
                </div>
                <div>
                  <label className="ms-overline">Durée minimale (min)</label>
                  <input type="number" min={5} step={5} value={form.min_duration_minutes || 15} onChange={(e) => setForm({ ...form, min_duration_minutes: e.target.value })} className="ms-input mt-1" data-testid="admin-room-mindur" />
                </div>
              </div>

              <div>
                <label className="ms-overline">Description</label>
                <textarea rows={3} value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} className="ms-input mt-1 resize-y" data-testid="admin-room-desc" />
              </div>

              <div>
                <label className="ms-overline">Équipements</label>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {EQUIPMENT_OPTIONS.map(([k, l]) => {
                    const on = (form.equipments || []).includes(k);
                    return (
                      <button key={k} onClick={() => toggleArr("equipments", k)} className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${on ? "bg-[#3BA4FF] text-white" : "bg-[#F4F7FA] text-[#475569]"}`} data-testid={`admin-room-eq-${k}`}>
                        {l}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="ms-overline">Services disponibles</label>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {SERVICE_OPTIONS.map(([k, l]) => {
                    const on = (form.services || []).includes(k);
                    return (
                      <button key={k} onClick={() => toggleArr("services", k)} className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${on ? "bg-[#F59E0B] text-white" : "bg-[#F4F7FA] text-[#475569]"}`} data-testid={`admin-room-svc-${k}`}>
                        {l}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="ms-overline">Statut</label>
                <div className="mt-1 flex gap-2">
                  {Object.entries(STATUS_META).map(([k, m]) => (
                    <button key={k} onClick={() => setForm({ ...form, status: k })} data-testid={`admin-room-status-${k}`}
                      className={`px-3 py-2 rounded-xl text-sm font-semibold flex-1 ${form.status === k ? `${m.cls} ring-2 ring-current/40` : "bg-[#F4F7FA] text-[#475569]"}`}>
                      {m.l}
                    </button>
                  ))}
                </div>
                {form.status === "maintenance" && (
                  <input
                    className="ms-input mt-2"
                    placeholder="Note de maintenance (ex : peinture en cours jusqu'au 30/08)"
                    value={form.maintenance_note || ""}
                    onChange={(e) => setForm({ ...form, maintenance_note: e.target.value })}
                    data-testid="admin-room-maint-note"
                  />
                )}
              </div>

              <label className="flex items-center gap-2 cursor-pointer rounded-xl bg-[#F8FAFC] p-3">
                <input
                  type="checkbox"
                  checked={form.status === "available"}
                  onChange={(e) => setForm({ ...form, status: e.target.checked ? "available" : "unavailable" })}
                  className="h-4 w-4 accent-[#3BA4FF]"
                  data-testid="admin-room-allow"
                />
                <span className="text-sm text-[#334155]">Autoriser la réservation par les collaborateurs</span>
              </label>
            </div>

            {/* Right column — photos */}
            <div className="p-5 space-y-4">
              <div>
                <label className="ms-overline">Photo principale</label>
                <div className="mt-1 rounded-2xl bg-[#F8FAFC] p-3 flex items-center gap-3">
                  <img src={form.photo_url || DEFAULT_PHOTO} onError={(e) => { e.currentTarget.src = DEFAULT_PHOTO; }} alt="" className="h-20 w-28 object-cover rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <input value={form.photo_url || ""} onChange={(e) => setForm({ ...form, photo_url: e.target.value })} placeholder="URL de la photo" className="ms-input" data-testid="admin-room-photo-url" />
                    <button onClick={() => mainFileRef.current?.click()} disabled={uploading} className="ms-btn-secondary text-xs" data-testid="admin-room-photo-upload">
                      <Upload className="h-3.5 w-3.5" /> {uploading ? "Envoi…" : "Importer depuis la galerie"}
                    </button>
                    <input ref={mainFileRef} type="file" accept="image/*" hidden onChange={onMainUpload} />
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="ms-overline">Galerie ({(form.photos || []).length})</label>
                  <button onClick={() => galleryFileRef.current?.click()} disabled={uploading} className="ms-btn-secondary text-xs" data-testid="admin-room-gallery-upload">
                    <ImageIcon className="h-3.5 w-3.5" /> Ajouter des photos
                  </button>
                  <input ref={galleryFileRef} type="file" accept="image/*" multiple hidden onChange={onGalleryUpload} />
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(form.photos || []).map((p, i) => (
                    <div key={i} className="relative rounded-lg overflow-hidden group" data-testid={`admin-room-photo-${i}`}>
                      <img src={p} alt="" onError={(e) => { e.currentTarget.src = DEFAULT_PHOTO; }} className="w-full h-20 object-cover" />
                      <button onClick={() => removePhoto(i)} className="absolute top-1 right-1 h-6 w-6 rounded-full bg-white/90 hover:bg-white shadow inline-flex items-center justify-center text-red-600 opacity-0 group-hover:opacity-100">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {(form.photos || []).length === 0 && (
                    <div className="col-span-3 rounded-lg bg-[#F8FAFC] p-6 text-center text-xs text-[#94A3B8]">
                      Aucune photo secondaire. Ajoutez plusieurs photos pour créer un carrousel côté employé.
                    </div>
                  )}
                </div>
              </div>

              {photos.length > 0 && (
                <div>
                  <label className="ms-overline">Aperçu carrousel</label>
                  <div className="relative mt-1 rounded-xl overflow-hidden bg-black h-40">
                    <img src={photos[carouselIdx % photos.length]} alt="" onError={(e) => { e.currentTarget.src = DEFAULT_PHOTO; }} className="w-full h-full object-cover" />
                    {photos.length > 1 && (
                      <>
                        <button onClick={() => setCarouselIdx((i) => (i - 1 + photos.length) % photos.length)} className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-white/90 hover:bg-white shadow inline-flex items-center justify-center">
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button onClick={() => setCarouselIdx((i) => (i + 1) % photos.length)} className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-white/90 hover:bg-white shadow inline-flex items-center justify-center">
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="px-5 py-3 border-t border-[#071B34]/5 flex items-center justify-between">
          <div className="text-xs text-[#475569]">
            Statut publié : <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest ${statusMeta.cls}`}>{statusMeta.l}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-2 rounded-xl text-sm text-[#475569] hover:bg-[#F4F7FA]">Annuler</button>
            <button onClick={save} disabled={saving} className="ms-btn-primary" data-testid="admin-room-save">
              <Sparkles className="h-4 w-4" /> {saving ? "Enregistrement…" : (isNew ? "Publier la salle" : "Enregistrer")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Employee-side preview of the room card
function PreviewCard({ form, photos }) {
  const status = form.status || "available";
  const equipments = form.equipments || [];
  return (
    <div className="p-6 bg-gradient-to-br from-[#F8FAFC] to-white" data-testid="admin-preview">
      <div className="text-[11px] uppercase tracking-widest font-semibold text-[#475569] mb-3">Aperçu — vue collaborateur</div>
      <div className="max-w-sm mx-auto ms-card overflow-hidden">
        <div className="relative aspect-[16/10] bg-[#F4F7FA]">
          <img src={photos[0] || DEFAULT_PHOTO} onError={(e) => { e.currentTarget.src = DEFAULT_PHOTO; }} alt="" className="w-full h-full object-cover" />
          <span className={`absolute top-3 left-3 text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full ${STATUS_META[status]?.cls}`}>
            {STATUS_META[status]?.l}
          </span>
        </div>
        <div className="p-4">
          <div className="text-base font-bold text-[#071B34]">{form.name || "Nom de la salle"}</div>
          <div className="mt-1 text-xs text-[#475569] flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {form.capacity || 1} pers.</span>
            {form.floor && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {form.floor}</span>}
          </div>
          {form.description && <p className="mt-3 text-xs text-[#475569] line-clamp-3">{form.description}</p>}
          <div className="mt-3 text-[11px] text-[#475569]">
            {equipments.slice(0, 4).map((k) => EQUIPMENT_OPTIONS.find(([kk]) => kk === k)?.[1]).filter(Boolean).join(" · ")}
          </div>
          <button className="mt-4 w-full ms-btn-primary" disabled>
            {status === "available" ? "Voir les disponibilités" : "Indisponible"}
          </button>
        </div>
      </div>
    </div>
  );
}
