import { useEffect, useState, useMemo, useCallback } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Camera, Search, Plus, ArrowLeft, Star, Download, Upload, Trash2, X,
  Users, Calendar, ImagePlus, Heart, MoreVertical, Edit3,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { api, absoluteUrl, formatDateFr } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";
import PortalModal from "@/components/PortalModal";

const CATEGORIES = ["Événement", "Team Building", "Formation", "Restaurant", "Vie du parc", "Autres"];

// ─────────────────────────────────────────────────────────────
// LIST — Albums
// ─────────────────────────────────────────────────────────────
export default function GalerieList() {
  const { me } = useApp();
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const navigate = useNavigate();
  const isEditor = me?.is_admin || me?.can_manage_communication;

  const load = async () => {
    const params = new URLSearchParams();
    if (cat !== "all") params.set("category", cat);
    if (q) params.set("q", q);
    const { data } = await api.get(`/galleries?${params}`);
    setItems(data);
  };
  useEffect(() => { load(); }, [cat, q]); // eslint-disable-line

  return (
    <div className="space-y-5 ms-fade-up">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="ms-overline">Accueil › Communication interne › Galerie Photos</div>
          <div className="mt-1 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#3BA4FF]/10 text-[#3BA4FF]"><Camera className="h-5 w-5" /></div>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[#071B34]">Galerie Photos</h1>
              <p className="text-sm text-[#475569] mt-0.5">Retrouvez les moments forts de MS Park</p>
            </div>
          </div>
        </div>
        {isEditor && (
          <button onClick={() => setShowCreate(true)} data-testid="album-create" className="ms-btn-primary">
            <Plus className="h-4 w-4" /> Nouvel album
          </button>
        )}
      </div>

      <div className="ms-card p-3 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[220px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} data-testid="gal-search" placeholder="Rechercher un album…" className="ms-input pl-9" />
        </div>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="ms-input max-w-[220px]">
          <option value="all">Toutes catégories</option>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {items.length === 0 && (
          <div className="ms-card col-span-full p-12 text-center text-sm text-[#475569]">Aucun album pour le moment.</div>
        )}
        {items.map((g) => (
          <button
            key={g.id}
            onClick={() => navigate(`/galerie/${g.id}`)}
            data-testid={`album-${g.id}`}
            className="ms-card overflow-hidden hover:shadow-lg transition-all text-left group"
          >
            <div
              className="h-40 bg-cover bg-center relative"
              style={{
                backgroundImage: g.cover_image
                  ? `url(${absoluteUrl(g.cover_image)})`
                  : "linear-gradient(135deg, #0B2545, #3BA4FF)",
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-t from-[#071B34]/70 to-transparent" />
              <div className="absolute top-3 left-3 flex items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-widest bg-white/90 backdrop-blur text-[#071B34] px-2 py-0.5 rounded-full font-semibold">{g.category}</span>
                {g.allow_contributions && (
                  <span className="text-[10px] bg-[#10B981]/95 text-white px-2 py-0.5 rounded-full font-semibold">Contributions ouvertes</span>
                )}
              </div>
              <div className="absolute bottom-3 right-3 rounded-lg bg-black/40 text-white text-xs font-semibold px-2 py-1 backdrop-blur">
                {g.photo_count || 0} photos
              </div>
            </div>
            <div className="p-4">
              <h3 className="text-base font-bold text-[#071B34] line-clamp-1">{g.title}</h3>
              <p className="text-xs text-[#475569] mt-1 line-clamp-2">{g.description}</p>
              {g.event_date && (
                <div className="text-[11px] text-[#94A3B8] mt-2 inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> {formatDateFr(g.event_date)}</div>
              )}
            </div>
          </button>
        ))}
      </div>

      {showCreate && <AlbumEditor onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); load(); }} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// DETAIL — Album with photos
// ─────────────────────────────────────────────────────────────
export function GalerieAlbum() {
  const { id } = useParams();
  const { me } = useApp();
  const [g, setG] = useState(null);
  const [q, setQ] = useState("");
  const [showFav, setShowFav] = useState(false);
  const [lightbox, setLightbox] = useState(null); // { index: number }
  const [editing, setEditing] = useState(false);
  const isEditor = me?.is_admin || me?.can_manage_communication;
  const canContribute = isEditor || g?.allow_contributions;

  const load = async () => {
    const { data } = await api.get(`/galleries/${id}`);
    setG(data);
  };
  useEffect(() => { load(); }, [id]); // eslint-disable-line

  const filtered = useMemo(() => {
    if (!g) return [];
    return g.photos.filter((p) => {
      if (showFav && !p.is_favorite) return false;
      if (q && !(p.caption || "").toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [g, q, showFav]);

  // Lightbox navigation
  const closeLightbox = useCallback(() => setLightbox(null), []);
  const nextPhoto = useCallback(() => {
    setLightbox((lb) => {
      if (!lb || filtered.length === 0) return lb;
      return { index: (lb.index + 1) % filtered.length };
    });
  }, [filtered.length]);
  const prevPhoto = useCallback(() => {
    setLightbox((lb) => {
      if (!lb || filtered.length === 0) return lb;
      return { index: (lb.index - 1 + filtered.length) % filtered.length };
    });
  }, [filtered.length]);

  // Keyboard navigation while lightbox is open
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e) => {
      if (e.key === "Escape") closeLightbox();
      else if (e.key === "ArrowRight") nextPhoto();
      else if (e.key === "ArrowLeft") prevPhoto();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, closeLightbox, nextPhoto, prevPhoto]);

  const uploadPhoto = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    for (const file of files) {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/uploads", fd, { headers: { "Content-Type": "multipart/form-data" } });
      await api.post(`/galleries/${id}/photos`, { url: data.url, caption: "" });
    }
    toast.success(`${files.length} photo(s) ajoutée(s)`);
    load();
  };

  const toggleFav = async (pid) => {
    await api.post(`/photos/${pid}/favorite`);
    load();
  };

  const del = async (pid) => {
    if (!window.confirm("Supprimer cette photo ?")) return;
    await api.delete(`/photos/${pid}`);
    toast.success("Photo supprimée");
    load();
  };

  if (!g) return <div className="ms-card p-10 animate-pulse h-96" />;

  return (
    <div className="space-y-5 ms-fade-up">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link to="/galerie" className="ms-btn-outline text-xs"><ArrowLeft className="h-3 w-3" /> Retour aux albums</Link>
        <div className="flex gap-2">
          {isEditor && (
            <button onClick={() => setEditing(true)} className="ms-btn-outline text-xs"><Edit3 className="h-3 w-3" /> Modifier l&apos;album</button>
          )}
          {canContribute && (
            <label className="ms-btn-primary cursor-pointer">
              <Upload className="h-4 w-4" /> Ajouter des photos
              <input type="file" multiple accept="image/*" className="hidden" onChange={uploadPhoto} data-testid="album-upload" />
            </label>
          )}
        </div>
      </div>

      <div
        className="rounded-3xl overflow-hidden bg-[#071B34] text-white p-10 min-h-[220px] flex flex-col justify-end"
        style={{
          backgroundImage: g.cover_image
            ? `linear-gradient(180deg, rgba(7,27,52,0.2), rgba(7,27,52,0.9)), url(${absoluteUrl(g.cover_image)}) center/cover`
            : "linear-gradient(135deg, #0B2545, #3BA4FF)",
        }}
      >
        <div className="text-[10px] uppercase tracking-widest opacity-80">{g.category}</div>
        <h1 className="mt-2 text-3xl md:text-4xl font-bold">{g.title}</h1>
        {g.description && <p className="mt-2 opacity-90 max-w-xl">{g.description}</p>}
        <div className="mt-3 flex items-center gap-4 text-xs opacity-80 flex-wrap">
          <span className="inline-flex items-center gap-1"><Camera className="h-3 w-3" /> {g.photos.length} photos</span>
          {g.event_date && <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> {formatDateFr(g.event_date)}</span>}
          {g.allow_contributions && <span className="inline-flex items-center gap-1 bg-[#10B981]/80 px-2 py-0.5 rounded-full"><Users className="h-3 w-3" /> Contributions ouvertes</span>}
        </div>
      </div>

      <div className="ms-card p-3 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[220px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} data-testid="album-photo-search" placeholder="Rechercher une photo…" className="ms-input pl-9" />
        </div>
        <button
          onClick={() => setShowFav((v) => !v)}
          data-testid="fav-filter"
          className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${showFav ? "bg-[#F59E0B] text-white" : "bg-[#F4F7FA] text-[#334155]"}`}
        >
          <Star className={`h-4 w-4 ${showFav ? "fill-white" : ""}`} /> {showFav ? "Tous" : "Favoris"}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="ms-card p-12 text-center text-sm text-[#475569]">Aucune photo à afficher.</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map((p, i) => (
            <div key={p.id} className="relative group rounded-2xl overflow-hidden aspect-square bg-[#F4F7FA]" data-testid={`photo-${p.id}`}>
              <img
                src={absoluteUrl(p.url)}
                alt={p.caption}
                onClick={() => setLightbox({ index: i })}
                className="w-full h-full object-cover cursor-zoom-in transition-transform group-hover:scale-105"
              />
              <div className="absolute top-2 right-2 flex items-center gap-1">
                <button
                  onClick={() => toggleFav(p.id)}
                  className={`h-8 w-8 rounded-lg bg-white/90 backdrop-blur flex items-center justify-center shadow ${p.is_favorite ? "text-[#F59E0B]" : "text-[#475569]"}`}
                  title="Favori"
                >
                  <Star className={`h-4 w-4 ${p.is_favorite ? "fill-[#F59E0B]" : ""}`} />
                </button>
                <a href={absoluteUrl(p.url)} download target="_blank" rel="noreferrer" className="h-8 w-8 rounded-lg bg-white/90 backdrop-blur flex items-center justify-center shadow text-[#475569]" title="Télécharger">
                  <Download className="h-4 w-4" />
                </a>
                {(isEditor || p.uploader_id === me?.id) && (
                  <button onClick={() => del(p.id)} className="h-8 w-8 rounded-lg bg-white/90 backdrop-blur flex items-center justify-center shadow text-[#B91C1C]" title="Supprimer">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              {p.caption && (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3">
                  <p className="text-xs text-white line-clamp-2">{p.caption}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {lightbox && filtered[lightbox.index] && (
        <PortalModal>
          <div
            onClick={closeLightbox}
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 select-none"
            data-testid="album-lightbox"
          >
            {/* Close */}
            <button
              onClick={(e) => { e.stopPropagation(); closeLightbox(); }}
              className="absolute top-4 right-4 text-white h-10 w-10 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full transition-colors z-10"
              aria-label="Fermer"
              data-testid="lightbox-close"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Counter */}
            {filtered.length > 1 && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/90 text-sm font-semibold bg-white/10 px-3 py-1 rounded-full backdrop-blur">
                {lightbox.index + 1} / {filtered.length}
              </div>
            )}

            {/* Prev arrow */}
            {filtered.length > 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); prevPhoto(); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-white h-12 w-12 flex items-center justify-center bg-white/10 hover:bg-white/25 rounded-full transition-colors z-10"
                aria-label="Photo précédente"
                data-testid="lightbox-prev"
              >
                <ChevronLeft className="h-7 w-7" />
              </button>
            )}

            {/* Image + caption (stopPropagation so clicking image doesn't close) */}
            <div
              className="flex flex-col items-center max-w-full max-h-full"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={absoluteUrl(filtered[lightbox.index].url)}
                alt=""
                className="max-w-[90vw] max-h-[85vh] rounded-2xl object-contain"
              />
              {filtered[lightbox.index].caption && (
                <p className="mt-3 text-sm text-white/90 max-w-[80vw] text-center">
                  {filtered[lightbox.index].caption}
                </p>
              )}
            </div>

            {/* Next arrow */}
            {filtered.length > 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); nextPhoto(); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white h-12 w-12 flex items-center justify-center bg-white/10 hover:bg-white/25 rounded-full transition-colors z-10"
                aria-label="Photo suivante"
                data-testid="lightbox-next"
              >
                <ChevronRight className="h-7 w-7" />
              </button>
            )}
          </div>
        </PortalModal>
      )}

      {editing && <AlbumEditor album={g} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Album create/edit modal
// ─────────────────────────────────────────────────────────────
function AlbumEditor({ album, onClose, onSaved }) {
  const [f, setF] = useState(
    album || { title: "", description: "", category: "Événement", cover_image: "", allow_contributions: false, event_date: "" }
  );
  const save = async () => {
    if (!f.title.trim()) { toast.error("Le titre est requis"); return; }
    try {
      if (album) await api.put(`/admin/galleries/${album.id}`, f);
      else await api.post("/admin/galleries", f);
      toast.success(album ? "Album mis à jour" : "Album créé");
      onSaved();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Erreur");
    }
  };
  const uploadCover = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    const { data } = await api.post("/uploads", fd, { headers: { "Content-Type": "multipart/form-data" } });
    setF({ ...f, cover_image: data.url });
  };

  return (
    <PortalModal>
    <div onClick={onClose} className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-[#071B34]">{album ? "Modifier l'album" : "Nouvel album"}</h2>
          <button onClick={onClose} className="h-9 w-9 rounded-xl hover:bg-[#F4F7FA] flex items-center justify-center"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="ms-overline">Titre *</label>
            <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} data-testid="album-title" placeholder="Séminaire annuel 2026" className="ms-input mt-1" />
          </div>
          <div>
            <label className="ms-overline">Description</label>
            <textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={3} className="ms-input mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="ms-overline">Catégorie</label>
              <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} data-testid="album-category" className="ms-input mt-1">
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="ms-overline">Date de l&apos;événement</label>
              <input type="date" value={f.event_date || ""} onChange={(e) => setF({ ...f, event_date: e.target.value })} className="ms-input mt-1" />
            </div>
          </div>
          <div>
            <label className="ms-overline">Image de couverture</label>
            {f.cover_image && <img src={absoluteUrl(f.cover_image)} alt="" className="mt-2 w-full h-32 object-cover rounded-xl" />}
            <label className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-[#3BA4FF] text-white text-xs font-semibold px-3 py-1.5 cursor-pointer">
              <ImagePlus className="h-3 w-3" /> {f.cover_image ? "Remplacer" : "Ajouter"} l&apos;image
              <input type="file" accept="image/*" className="hidden" onChange={uploadCover} />
            </label>
          </div>
          <label className="flex items-center gap-3 rounded-2xl bg-[#F4F7FA] p-4 cursor-pointer">
            <input type="checkbox" checked={f.allow_contributions} onChange={(e) => setF({ ...f, allow_contributions: e.target.checked })} data-testid="album-contrib" className="h-4 w-4" />
            <div>
              <div className="text-sm font-semibold text-[#071B34]">Autoriser les contributions</div>
              <div className="text-xs text-[#475569]">Les collaborateurs pourront ajouter leurs propres photos à cet album.</div>
            </div>
          </label>
        </div>
        <div className="flex gap-2 justify-end pt-4 border-t border-[#071B34]/5">
          <button onClick={onClose} className="ms-btn-outline">Annuler</button>
          <button onClick={save} data-testid="album-save" className="ms-btn-primary">{album ? "Enregistrer" : "Créer l'album"}</button>
        </div>
      </div>
    </div>
    </PortalModal>
  );
}
