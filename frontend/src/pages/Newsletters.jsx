import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Mail, Search, Bell, Bookmark, Plus, ArrowLeft, Clock, Paperclip, Archive,
  MoreVertical, Save, X, Edit3, Trash2, Send, GripVertical, Type, Heading1,
  Image as ImageIcon, MousePointerClick, Minus, Columns2, Palette, Copy,
  Eye, ChevronUp, ChevronDown, AlignLeft, AlignCenter, AlignRight,
} from "lucide-react";
import { toast } from "sonner";
import { api, formatDateFr, absoluteUrl } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";

const CATEGORIES = ["Général", "RH", "Événement", "Projet", "Procédure", "Ouverture"];
const uid = () => Math.random().toString(36).slice(2, 10);

// ═══════════════════════════════════════════════════════════════════
// Block registry
// ═══════════════════════════════════════════════════════════════════
const BLOCK_TYPES = {
  heading: { label: "Titre", icon: Heading1, def: () => ({ text: "Titre de la section", level: 2, align: "left", color: "#071B34" }) },
  text:    { label: "Texte", icon: Type, def: () => ({ text: "Écrivez votre paragraphe ici. Vous pouvez éditer ce texte à tout moment.", align: "left", color: "#334155" }) },
  image:   { label: "Image", icon: ImageIcon, def: () => ({ url: "", caption: "" }) },
  button:  { label: "Bouton", icon: MousePointerClick, def: () => ({ text: "En savoir plus", url: "https://", align: "center", bg: "#3BA4FF", color: "#ffffff" }) },
  divider: { label: "Séparateur", icon: Minus, def: () => ({}) },
  columns: { label: "2 colonnes", icon: Columns2, def: () => ({ image: "", title: "Titre", text: "Description à personnaliser.", reverse: false }) },
  hero:    { label: "Bloc hero", icon: Palette, def: () => ({ title: "Une bonne nouvelle !", subtitle: "Sous-titre", bg: "#0B2545", color: "#ffffff", image: "" }) },
};

// ═══════════════════════════════════════════════════════════════════
// LIST PAGE
// ═══════════════════════════════════════════════════════════════════
export default function NewslettersList() {
  const { me } = useApp();
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [tab, setTab] = useState("published");
  const navigate = useNavigate();
  const isEditor = me?.is_admin || me?.can_manage_communication;

  const load = async () => {
    const params = new URLSearchParams({ archived: tab === "archived" });
    if (category !== "all") params.set("category", category);
    if (q) params.set("q", q);
    const { data } = await api.get(`/newsletters?${params}`);
    setItems(data);
  };
  useEffect(() => { load(); }, [tab, category, q]); // eslint-disable-line

  return (
    <div className="space-y-5 ms-fade-up">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="ms-overline flex items-center gap-1">Accueil › Communication interne › Newsletters</div>
          <div className="mt-1 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#3BA4FF]/10 text-[#3BA4FF]">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[#071B34]">Newsletters</h1>
              <p className="text-sm text-[#475569] mt-0.5">Retrouvez toutes les newsletters de MS Park</p>
            </div>
          </div>
        </div>
        {isEditor && (
          <button onClick={() => navigate("/newsletters/new")} data-testid="newsletter-create" className="ms-btn-primary">
            <Plus className="h-4 w-4" /> Nouvelle newsletter
          </button>
        )}
      </div>

      <div className="rounded-3xl bg-gradient-to-br from-[#EBF4FF] to-[#DBE7FF] p-8 flex items-center justify-between gap-6 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <h2 className="text-2xl md:text-3xl font-bold text-[#071B34]">Restez informé, restez connecté !</h2>
          <p className="text-sm text-[#475569] mt-2 max-w-md">
            {"Nos newsletters vous informent sur l'actualité de l'entreprise, les projets en cours et les événements à venir."}
          </p>
        </div>
        <div className="rounded-2xl bg-white p-4 max-w-xs">
          <div className="flex items-center gap-2 text-[#071B34]">
            <Bell className="h-4 w-4" />
            <span className="text-sm font-bold">Ne manquez aucune newsletter</span>
          </div>
          <p className="text-xs text-[#475569] mt-1">{"Activez les notifications pour être prévenu dès qu'une nouvelle newsletter est publiée."}</p>
          <button className="mt-3 w-full rounded-xl bg-[#071B34] text-white text-sm font-semibold px-4 py-2">Activer les notifications</button>
        </div>
      </div>

      <div className="ms-card p-3 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[220px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} data-testid="nl-search" placeholder="Rechercher une newsletter…" className="ms-input pl-9" />
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value)} data-testid="nl-cat" className="ms-input max-w-[200px]">
          <option value="all">Toutes catégories</option>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <div className="flex rounded-xl bg-[#F4F7FA] p-1">
          {[["published", "Publiées"], ["archived", "Archivées"]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} data-testid={`nl-tab-${k}`} className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${tab === k ? "bg-white shadow" : "text-[#475569]"}`}>{l}</button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold text-[#071B34]">Toutes les newsletters</span>
          <span className="ms-chip !text-[10px]">{items.length}</span>
        </div>
        {items.length === 0 && (
          <div className="ms-card p-8 text-center text-sm text-[#475569]">Aucune newsletter dans cette catégorie.</div>
        )}
        {items.map((n) => <NewsletterCard key={n.id} nl={n} isEditor={isEditor} onChange={load} />)}
      </div>
    </div>
  );
}

function NewsletterCard({ nl, isEditor, onChange }) {
  const navigate = useNavigate();
  const isNew = nl.published_at && (Date.now() - new Date(nl.published_at).getTime()) < 7 * 24 * 3600 * 1000;
  const [menu, setMenu] = useState(false);
  const cover = absoluteUrl(nl.cover_image);
  return (
    <div className="ms-card overflow-hidden hover:shadow-md transition-shadow flex flex-col md:flex-row" data-testid={`nl-${nl.id}`}>
      <div
        className="w-full md:w-56 md:shrink-0 h-32 md:h-auto bg-cover bg-center flex flex-col justify-end p-4 text-white"
        style={{
          backgroundImage: cover
            ? `linear-gradient(180deg, rgba(7,27,52,0.15) 0%, rgba(7,27,52,0.85) 100%), url(${cover})`
            : "linear-gradient(135deg, #0B2545, #3BA4FF)",
        }}
      >
        <div className="text-[10px] uppercase tracking-widest opacity-80">{nl.category}</div>
        <div className="text-2xl font-bold leading-tight mt-1 line-clamp-2">{nl.title}</div>
      </div>
      <div className="flex-1 p-4 flex flex-col md:flex-row gap-3 items-start md:items-center min-w-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-bold text-[#071B34] truncate">{nl.title}</h3>
            {isNew && <span className="ms-chip bg-[#10B981]/15 text-[#047857] !text-[10px]">Nouveau</span>}
            {nl.archived && <span className="ms-chip bg-[#94A3B8]/15 text-[#475569] !text-[10px]">Archivée</span>}
            {!nl.published && <span className="ms-chip bg-[#F59E0B]/15 text-[#B45309] !text-[10px]">Brouillon</span>}
          </div>
          <div className="text-xs text-[#475569] mt-1">
            📅 {nl.published_at ? formatDateFr(nl.published_at.slice(0, 10)) : "Non publié"} · {nl.reading_time || 3} min de lecture
          </div>
          <p className="text-sm text-[#475569] mt-2 line-clamp-2">{nl.preheader || nl.subject}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => navigate(`/newsletters/${nl.id}`)} data-testid={`nl-read-${nl.id}`} className="rounded-xl bg-[#071B34] text-white text-sm font-semibold px-4 py-2 hover:bg-[#0B2545]">
            Lire la newsletter
          </button>
          <button className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[#071B34]/5"><Bookmark className="h-4 w-4" /></button>
          {isEditor && (
            <div className="relative">
              <button onClick={() => setMenu((v) => !v)} data-testid={`nl-menu-${nl.id}`} className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[#071B34]/5">
                <MoreVertical className="h-4 w-4" />
              </button>
              {menu && (
                <div className="absolute right-0 top-full mt-1 z-30 w-44 rounded-xl bg-white shadow-xl border border-[#071B34]/5 py-1 text-sm">
                  <button onClick={() => { setMenu(false); navigate(`/newsletters/${nl.id}/edit`); }} className="w-full text-left px-3 py-2 hover:bg-[#F4F7FA] flex items-center gap-2"><Edit3 className="h-3.5 w-3.5" /> Modifier</button>
                  {!nl.archived && (
                    <button onClick={async () => { setMenu(false); await api.post(`/admin/newsletters/${nl.id}/archive`); toast.success("Archivée"); onChange(); }} className="w-full text-left px-3 py-2 hover:bg-[#F4F7FA] flex items-center gap-2"><Archive className="h-3.5 w-3.5" /> Archiver</button>
                  )}
                  <button onClick={async () => {
                    if (!window.confirm("Supprimer cette newsletter ?")) return;
                    setMenu(false);
                    await api.delete(`/admin/newsletters/${nl.id}`);
                    toast.success("Supprimée"); onChange();
                  }} className="w-full text-left px-3 py-2 hover:bg-[#FEE2E2] text-[#B91C1C] flex items-center gap-2"><Trash2 className="h-3.5 w-3.5" /> Supprimer</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// DETAIL PAGE (public read)
// ═══════════════════════════════════════════════════════════════════
export function NewsletterDetail() {
  const { id } = useParams();
  const [nl, setNl] = useState(null);
  useEffect(() => { api.get(`/newsletters/${id}`).then((r) => setNl(r.data)); }, [id]);
  if (!nl) return <div className="ms-card p-10 animate-pulse h-96" />;
  const cover = absoluteUrl(nl.cover_image);
  return (
    <div className="space-y-5 ms-fade-up max-w-4xl mx-auto">
      <Link to="/newsletters" className="ms-btn-outline text-xs w-max"><ArrowLeft className="h-3 w-3" /> Retour</Link>
      <div
        className="relative rounded-3xl overflow-hidden bg-[#071B34] text-white p-10 min-h-[280px] flex flex-col justify-end"
        style={{ backgroundImage: cover ? `linear-gradient(180deg, rgba(7,27,52,0.15), rgba(7,27,52,0.9)), url(${cover})` : undefined, backgroundSize: "cover", backgroundPosition: "center" }}
      >
        <div className="text-[10px] uppercase tracking-widest opacity-80">Newsletter interne · {nl.category}</div>
        <h1 className="mt-2 text-4xl md:text-5xl font-bold tracking-tight">{nl.title}</h1>
        {nl.subject && <p className="mt-3 text-lg opacity-90">{nl.subject}</p>}
        <div className="mt-4 flex items-center gap-4 text-xs opacity-80">
          <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {nl.reading_time || 3} min</span>
          <span>Publié le {nl.published_at ? formatDateFr(nl.published_at.slice(0, 10)) : "—"}</span>
        </div>
      </div>

      <div className="ms-card p-6 md:p-10 space-y-6">
        {(nl.blocks || []).map((b) => <RenderBlock key={b.id} b={b} />)}
        {(!nl.blocks || nl.blocks.length === 0) && nl.body_html && (
          <div className="ms-prose" dangerouslySetInnerHTML={{ __html: nl.body_html }} />
        )}
        {(!nl.blocks || nl.blocks.length === 0) && !nl.body_html && (
          <p className="text-[#475569] italic">Aucun contenu.</p>
        )}
      </div>

      {(nl.attachments || []).length > 0 && (
        <div className="ms-card p-6">
          <div className="ms-overline mb-3"><Paperclip className="h-3 w-3 inline mr-1" /> Pièces jointes</div>
          <div className="space-y-2">
            {nl.attachments.map((a, i) => (
              <a key={i} href={absoluteUrl(a.url)} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl bg-[#F4F7FA] p-3 hover:bg-[#3BA4FF]/10">
                <Paperclip className="h-4 w-4 text-[#3BA4FF]" />
                <span className="text-sm text-[#071B34] font-semibold">{a.name}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl bg-[#071B34] text-white p-6 text-center">
        <div className="text-lg font-bold">MS Park</div>
        <div className="text-xs opacity-70 mt-1">© {new Date().getFullYear()} · Communication interne</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// BLOCK RENDERER (read-only)
// ═══════════════════════════════════════════════════════════════════
function RenderBlock({ b }) {
  const p = b.props || {};
  const align = p.align || "left";
  const alignCls = { left: "text-left", center: "text-center", right: "text-right" }[align] || "text-left";

  if (b.type === "heading") {
    const Tag = `h${p.level || 2}`;
    const size = { 1: "text-3xl md:text-4xl", 2: "text-2xl md:text-3xl", 3: "text-xl md:text-2xl" }[p.level || 2];
    return <Tag className={`${size} font-bold ${alignCls}`} style={{ color: p.color || "#071B34" }}>{p.text}</Tag>;
  }
  if (b.type === "text") {
    return <p className={`text-base leading-relaxed whitespace-pre-wrap ${alignCls}`} style={{ color: p.color || "#334155" }}>{p.text}</p>;
  }
  if (b.type === "image") {
    if (!p.url) return null;
    return (
      <figure className="text-center">
        <img src={absoluteUrl(p.url)} alt={p.caption || ""} className="w-full rounded-2xl object-cover max-h-[480px]" />
        {p.caption && <figcaption className="text-xs text-[#94A3B8] mt-2 italic">{p.caption}</figcaption>}
      </figure>
    );
  }
  if (b.type === "button") {
    return (
      <div className={alignCls}>
        <a href={p.url || "#"} target="_blank" rel="noreferrer" className="inline-block rounded-xl font-semibold px-6 py-3 shadow-md hover:opacity-90 transition-opacity"
           style={{ background: p.bg || "#3BA4FF", color: p.color || "#fff" }}>
          {p.text || "Bouton"}
        </a>
      </div>
    );
  }
  if (b.type === "divider") {
    return <hr className="border-t border-[#071B34]/10 my-4" />;
  }
  if (b.type === "columns") {
    return (
      <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 items-center ${p.reverse ? "md:[direction:rtl]" : ""}`}>
        <div className="md:[direction:ltr]">
          {p.image && <img src={absoluteUrl(p.image)} alt="" className="w-full rounded-2xl object-cover max-h-72" />}
        </div>
        <div className="md:[direction:ltr]">
          <h3 className="text-xl font-bold text-[#071B34]">{p.title}</h3>
          <p className="text-sm text-[#475569] mt-2 whitespace-pre-wrap">{p.text}</p>
        </div>
      </div>
    );
  }
  if (b.type === "hero") {
    const bg = absoluteUrl(p.image);
    return (
      <div className="rounded-3xl p-8 md:p-12 text-center overflow-hidden"
           style={{
             background: bg
               ? `linear-gradient(180deg, ${hexAlpha(p.bg || "#0B2545", 0.6)}, ${hexAlpha(p.bg || "#0B2545", 0.9)}), url(${bg}) center/cover`
               : (p.bg || "#0B2545"),
             color: p.color || "#fff",
           }}>
        <h2 className="text-2xl md:text-4xl font-bold">{p.title}</h2>
        {p.subtitle && <p className="mt-3 opacity-90">{p.subtitle}</p>}
      </div>
    );
  }
  return null;
}

function hexAlpha(hex, a) {
  const h = (hex || "").replace("#", "");
  if (h.length !== 6) return `rgba(11,37,69,${a})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// ═══════════════════════════════════════════════════════════════════
// EDITOR (drag & drop blocks)
// ═══════════════════════════════════════════════════════════════════
export function NewsletterEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id || id === "new";
  const [f, setF] = useState({
    title: "", subject: "", preheader: "", cover_image: "", category: "Général",
    reading_time: 3, body_html: "", blocks: [], attachments: [], archived: false, published: false,
  });
  const [loading, setLoading] = useState(!isNew);
  const [selectedId, setSelectedId] = useState(null);
  const [previewMode, setPreviewMode] = useState(false);

  useEffect(() => {
    if (!isNew) {
      api.get(`/newsletters/${id}`).then((r) => {
        setF({ ...r.data, blocks: r.data.blocks || [] });
        setLoading(false);
      });
    }
  }, [id, isNew]);

  const selected = useMemo(() => f.blocks.find((b) => b.id === selectedId), [f.blocks, selectedId]);

  const addBlock = (type) => {
    const nb = { id: uid(), type, props: BLOCK_TYPES[type].def() };
    setF((s) => ({ ...s, blocks: [...s.blocks, nb] }));
    setSelectedId(nb.id);
  };
  const updateBlock = (blockId, patch) => {
    setF((s) => ({ ...s, blocks: s.blocks.map((b) => b.id === blockId ? { ...b, props: { ...b.props, ...patch } } : b) }));
  };
  const removeBlock = (blockId) => {
    setF((s) => ({ ...s, blocks: s.blocks.filter((b) => b.id !== blockId) }));
    if (selectedId === blockId) setSelectedId(null);
  };
  const duplicateBlock = (blockId) => {
    setF((s) => {
      const idx = s.blocks.findIndex((b) => b.id === blockId);
      if (idx < 0) return s;
      const clone = { ...s.blocks[idx], id: uid(), props: { ...s.blocks[idx].props } };
      const next = [...s.blocks];
      next.splice(idx + 1, 0, clone);
      return { ...s, blocks: next };
    });
  };
  const moveBlock = (blockId, dir) => {
    setF((s) => {
      const idx = s.blocks.findIndex((b) => b.id === blockId);
      if (idx < 0) return s;
      const ni = idx + dir;
      if (ni < 0 || ni >= s.blocks.length) return s;
      const next = [...s.blocks];
      [next[idx], next[ni]] = [next[ni], next[idx]];
      return { ...s, blocks: next };
    });
  };

  // Drag reorder
  const dragId = useRef(null);
  const onDragStart = (blockId) => (e) => {
    dragId.current = blockId;
    e.dataTransfer.effectAllowed = "move";
  };
  const onDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };
  const onDrop = (targetId) => (e) => {
    e.preventDefault();
    const src = dragId.current;
    dragId.current = null;
    if (!src || src === targetId) return;
    setF((s) => {
      const from = s.blocks.findIndex((b) => b.id === src);
      const to = s.blocks.findIndex((b) => b.id === targetId);
      if (from < 0 || to < 0) return s;
      const next = [...s.blocks];
      const [it] = next.splice(from, 1);
      next.splice(to, 0, it);
      return { ...s, blocks: next };
    });
  };

  const uploadFile = async (file) => {
    const fd = new FormData();
    fd.append("file", file);
    const { data } = await api.post("/uploads", fd, { headers: { "Content-Type": "multipart/form-data" } });
    return data.url;
  };

  const uploadCover = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadFile(file);
    setF((s) => ({ ...s, cover_image: url }));
    toast.success("Image de couverture ajoutée");
  };

  const addAttachment = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadFile(file);
    setF((s) => ({ ...s, attachments: [...(s.attachments || []), { name: file.name, url }] }));
    toast.success("Pièce jointe ajoutée");
  };

  const save = async (publish = false) => {
    if (!f.title.trim()) { toast.error("Le titre est requis"); return; }
    const payload = { ...f, published: publish || f.published };
    try {
      if (isNew) {
        const { data } = await api.post("/admin/newsletters", payload);
        toast.success(publish ? "Newsletter publiée" : "Brouillon enregistré");
        navigate(`/newsletters/${data.id}/edit`, { replace: true });
      } else {
        await api.put(`/admin/newsletters/${id}`, payload);
        toast.success(publish ? "Newsletter publiée" : "Enregistré");
        if (publish) navigate("/newsletters");
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Erreur");
    }
  };

  if (loading) return <div className="ms-card p-10 animate-pulse h-96" />;

  return (
    <div className="space-y-4 ms-fade-up">
      {/* Toolbar */}
      <div className="ms-card p-3 flex items-center justify-between gap-3 flex-wrap sticky top-0 z-20">
        <Link to="/newsletters" className="ms-btn-outline text-xs"><ArrowLeft className="h-3 w-3" /> Retour</Link>
        <div className="flex-1 text-center text-sm font-semibold text-[#071B34] truncate">
          {f.title || "Nouvelle newsletter"} {!f.published && <span className="ms-chip !text-[10px] bg-[#F59E0B]/15 text-[#B45309]">Brouillon</span>}
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setPreviewMode((v) => !v)} data-testid="nl-preview-toggle" className="ms-btn-outline"><Eye className="h-4 w-4" /> {previewMode ? "Éditer" : "Aperçu"}</button>
          <button onClick={() => save(false)} data-testid="nl-save-draft" className="ms-btn-outline"><Save className="h-4 w-4" /> Brouillon</button>
          <button onClick={() => save(true)} data-testid="nl-publish" className="ms-btn-primary"><Send className="h-4 w-4" /> Publier</button>
        </div>
      </div>

      {previewMode ? (
        <NewsletterPreview f={f} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr_320px] gap-4">
          {/* LEFT: Block palette */}
          <div className="ms-card p-3 space-y-1 h-max lg:sticky lg:top-24">
            <div className="ms-overline px-2 py-1.5">Ajouter un bloc</div>
            {Object.entries(BLOCK_TYPES).map(([key, cfg]) => {
              const Icon = cfg.icon;
              return (
                <button
                  key={key}
                  onClick={() => addBlock(key)}
                  data-testid={`nl-add-${key}`}
                  className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 hover:bg-[#3BA4FF]/10 text-sm text-[#071B34] transition-colors"
                >
                  <Icon className="h-4 w-4 text-[#3BA4FF]" />
                  <span>{cfg.label}</span>
                </button>
              );
            })}
          </div>

          {/* CENTER: Canvas */}
          <div className="space-y-4">
            {/* General info card */}
            <div className="ms-card p-5 space-y-4">
              <h2 className="text-lg font-bold text-[#071B34]">Informations générales</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="ms-overline">Titre interne</label>
                  <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} data-testid="nl-title" placeholder="Newsletter Juillet 2026" className="ms-input mt-2" />
                </div>
                <div>
                  <label className="ms-overline">Catégorie</label>
                  <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} data-testid="nl-category" className="ms-input mt-2">
                    {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="ms-overline">Objet</label>
                  <input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} data-testid="nl-subject" placeholder="Votre actu interne" className="ms-input mt-2" />
                </div>
                <div>
                  <label className="ms-overline">Temps de lecture (min)</label>
                  <input type="number" min={1} value={f.reading_time} onChange={(e) => setF({ ...f, reading_time: parseInt(e.target.value) || 3 })} className="ms-input mt-2" />
                </div>
                <div className="md:col-span-2">
                  <label className="ms-overline">Préheader (aperçu boîte mail)</label>
                  <input value={f.preheader} onChange={(e) => setF({ ...f, preheader: e.target.value })} data-testid="nl-preheader" placeholder="L'actu du mois, pour avancer ensemble" className="ms-input mt-2" />
                </div>
              </div>
            </div>

            {/* Cover */}
            <div className="ms-card p-5 space-y-3">
              <h2 className="text-lg font-bold text-[#071B34]">Image de couverture</h2>
              {f.cover_image && (
                <img src={absoluteUrl(f.cover_image)} alt="" className="w-full h-56 object-cover rounded-2xl" />
              )}
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1.5 rounded-lg bg-[#3BA4FF] text-white text-xs font-semibold px-3 py-1.5 cursor-pointer hover:bg-[#1D70B8] w-max">
                  <Copy className="h-3 w-3" /> {f.cover_image ? "Remplacer" : "Ajouter"} une image
                  <input type="file" accept="image/*" data-testid="nl-cover" className="hidden" onChange={uploadCover} />
                </label>
                {f.cover_image && (
                  <button onClick={() => setF({ ...f, cover_image: "" })} className="text-xs text-[#B91C1C] hover:underline">Retirer</button>
                )}
              </div>
            </div>

            {/* Blocks canvas */}
            <div className="ms-card p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-bold text-[#071B34]">Contenu — Blocs</h2>
                <span className="text-xs text-[#94A3B8]">{f.blocks.length} bloc{f.blocks.length > 1 ? "s" : ""}</span>
              </div>
              {f.blocks.length === 0 && (
                <div className="rounded-2xl border-2 border-dashed border-[#3BA4FF]/30 p-10 text-center text-sm text-[#475569]">
                  Cliquez sur un bloc dans la palette de gauche pour commencer votre newsletter.
                </div>
              )}
              <div className="space-y-3">
                {f.blocks.map((b, i) => (
                  <div
                    key={b.id}
                    draggable
                    onDragStart={onDragStart(b.id)}
                    onDragOver={onDragOver}
                    onDrop={onDrop(b.id)}
                    onClick={() => setSelectedId(b.id)}
                    data-testid={`nl-block-${b.id}`}
                    className={`group relative rounded-2xl border-2 bg-white transition-all cursor-pointer ${selectedId === b.id ? "border-[#3BA4FF] shadow-md" : "border-transparent hover:border-[#3BA4FF]/30"}`}
                  >
                    <div className="absolute -left-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center text-[#94A3B8]">
                      <GripVertical className="h-4 w-4 cursor-grab" />
                    </div>
                    <div className="absolute right-2 top-2 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={(e) => { e.stopPropagation(); moveBlock(b.id, -1); }} className="h-7 w-7 rounded-lg bg-white shadow flex items-center justify-center hover:bg-[#F4F7FA]" title="Monter"><ChevronUp className="h-3.5 w-3.5" /></button>
                      <button onClick={(e) => { e.stopPropagation(); moveBlock(b.id, +1); }} className="h-7 w-7 rounded-lg bg-white shadow flex items-center justify-center hover:bg-[#F4F7FA]" title="Descendre"><ChevronDown className="h-3.5 w-3.5" /></button>
                      <button onClick={(e) => { e.stopPropagation(); duplicateBlock(b.id); }} className="h-7 w-7 rounded-lg bg-white shadow flex items-center justify-center hover:bg-[#F4F7FA]" title="Dupliquer"><Copy className="h-3.5 w-3.5" /></button>
                      <button onClick={(e) => { e.stopPropagation(); removeBlock(b.id); }} className="h-7 w-7 rounded-lg bg-white shadow flex items-center justify-center hover:bg-[#FEE2E2] text-[#B91C1C]" title="Supprimer"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                    <div className="p-5">
                      <RenderBlock b={b} />
                    </div>
                    <div className="absolute -top-3 left-4 text-[10px] uppercase tracking-widest bg-white px-2 py-0.5 rounded-full border border-[#071B34]/10 text-[#475569]">
                      {BLOCK_TYPES[b.type]?.label || b.type}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Attachments */}
            <div className="ms-card p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-[#071B34]">Pièces jointes</h2>
                <label className="inline-flex items-center gap-1.5 rounded-lg bg-[#3BA4FF] text-white text-xs font-semibold px-3 py-1.5 cursor-pointer hover:bg-[#1D70B8]">
                  <Paperclip className="h-3 w-3" /> Ajouter
                  <input type="file" data-testid="nl-attachment" className="hidden" onChange={addAttachment} />
                </label>
              </div>
              <div className="mt-3 space-y-2">
                {(f.attachments || []).map((a, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-xl bg-[#F4F7FA] p-3">
                    <Paperclip className="h-4 w-4 text-[#3BA4FF]" />
                    <span className="flex-1 text-sm truncate">{a.name}</span>
                    <button onClick={() => setF({ ...f, attachments: f.attachments.filter((_, j) => j !== i) })} className="text-[#B91C1C]">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {(f.attachments || []).length === 0 && (
                  <p className="text-xs text-[#475569] italic">Aucune pièce jointe.</p>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT: Inspector */}
          <div className="ms-card p-4 h-max lg:sticky lg:top-24">
            <div className="ms-overline mb-3">Propriétés du bloc</div>
            {selected ? (
              <BlockInspector block={selected} onUpdate={(patch) => updateBlock(selected.id, patch)} uploadFile={uploadFile} />
            ) : (
              <p className="text-xs text-[#475569] italic">Cliquez sur un bloc pour éditer ses propriétés.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Inspector (right panel) ───────────────────────────────────────
function BlockInspector({ block, onUpdate, uploadFile }) {
  const p = block.props || {};
  const upload = async (e, key) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadFile(file);
    onUpdate({ [key]: url });
    toast.success("Image ajoutée");
  };

  if (block.type === "heading") return (
    <div className="space-y-3">
      <Field label="Texte"><input className="ms-input" value={p.text || ""} onChange={(e) => onUpdate({ text: e.target.value })} data-testid="nl-inspector-text" /></Field>
      <Field label="Niveau">
        <select className="ms-input" value={p.level || 2} onChange={(e) => onUpdate({ level: parseInt(e.target.value) })}>
          <option value={1}>H1 (grand)</option>
          <option value={2}>H2</option>
          <option value={3}>H3</option>
        </select>
      </Field>
      <AlignPicker value={p.align} onChange={(v) => onUpdate({ align: v })} />
      <ColorPicker label="Couleur du texte" value={p.color} onChange={(v) => onUpdate({ color: v })} />
    </div>
  );

  if (block.type === "text") return (
    <div className="space-y-3">
      <Field label="Contenu"><textarea rows={6} className="ms-input" value={p.text || ""} onChange={(e) => onUpdate({ text: e.target.value })} data-testid="nl-inspector-text" /></Field>
      <AlignPicker value={p.align} onChange={(v) => onUpdate({ align: v })} />
      <ColorPicker label="Couleur du texte" value={p.color} onChange={(v) => onUpdate({ color: v })} />
    </div>
  );

  if (block.type === "image") return (
    <div className="space-y-3">
      {p.url && <img src={absoluteUrl(p.url)} alt="" className="w-full rounded-xl object-cover max-h-40" />}
      <label className="inline-flex items-center gap-1.5 rounded-lg bg-[#3BA4FF] text-white text-xs font-semibold px-3 py-1.5 cursor-pointer">
        <ImageIcon className="h-3 w-3" /> {p.url ? "Remplacer" : "Ajouter"} {"l'image"}
        <input type="file" accept="image/*" className="hidden" onChange={(e) => upload(e, "url")} data-testid="nl-inspector-image-upload" />
      </label>
      <Field label="Légende"><input className="ms-input" value={p.caption || ""} onChange={(e) => onUpdate({ caption: e.target.value })} /></Field>
    </div>
  );

  if (block.type === "button") return (
    <div className="space-y-3">
      <Field label="Libellé"><input className="ms-input" value={p.text || ""} onChange={(e) => onUpdate({ text: e.target.value })} data-testid="nl-inspector-btn-text" /></Field>
      <Field label="Lien (URL)"><input className="ms-input" value={p.url || ""} onChange={(e) => onUpdate({ url: e.target.value })} placeholder="https://" /></Field>
      <AlignPicker value={p.align} onChange={(v) => onUpdate({ align: v })} />
      <ColorPicker label="Couleur de fond" value={p.bg} onChange={(v) => onUpdate({ bg: v })} />
      <ColorPicker label="Couleur du texte" value={p.color} onChange={(v) => onUpdate({ color: v })} />
    </div>
  );

  if (block.type === "divider") return <p className="text-xs text-[#475569] italic">Aucune propriété.</p>;

  if (block.type === "columns") return (
    <div className="space-y-3">
      {p.image && <img src={absoluteUrl(p.image)} alt="" className="w-full rounded-xl object-cover max-h-32" />}
      <label className="inline-flex items-center gap-1.5 rounded-lg bg-[#3BA4FF] text-white text-xs font-semibold px-3 py-1.5 cursor-pointer">
        <ImageIcon className="h-3 w-3" /> {p.image ? "Remplacer" : "Ajouter"} {"l'image"}
        <input type="file" accept="image/*" className="hidden" onChange={(e) => upload(e, "image")} />
      </label>
      <Field label="Titre"><input className="ms-input" value={p.title || ""} onChange={(e) => onUpdate({ title: e.target.value })} /></Field>
      <Field label="Texte"><textarea rows={4} className="ms-input" value={p.text || ""} onChange={(e) => onUpdate({ text: e.target.value })} /></Field>
      <label className="flex items-center gap-2 text-sm text-[#334155]">
        <input type="checkbox" checked={!!p.reverse} onChange={(e) => onUpdate({ reverse: e.target.checked })} />
        Inverser (texte à gauche)
      </label>
    </div>
  );

  if (block.type === "hero") return (
    <div className="space-y-3">
      {p.image && <img src={absoluteUrl(p.image)} alt="" className="w-full rounded-xl object-cover max-h-32" />}
      <label className="inline-flex items-center gap-1.5 rounded-lg bg-[#3BA4FF] text-white text-xs font-semibold px-3 py-1.5 cursor-pointer">
        <ImageIcon className="h-3 w-3" /> {p.image ? "Remplacer" : "Ajouter"} {"l'image d'arrière-plan"}
        <input type="file" accept="image/*" className="hidden" onChange={(e) => upload(e, "image")} />
      </label>
      <Field label="Titre"><input className="ms-input" value={p.title || ""} onChange={(e) => onUpdate({ title: e.target.value })} /></Field>
      <Field label="Sous-titre"><input className="ms-input" value={p.subtitle || ""} onChange={(e) => onUpdate({ subtitle: e.target.value })} /></Field>
      <ColorPicker label="Couleur d'arrière-plan" value={p.bg} onChange={(v) => onUpdate({ bg: v })} />
      <ColorPicker label="Couleur du texte" value={p.color} onChange={(v) => onUpdate({ color: v })} />
    </div>
  );

  return null;
}

function Field({ label, children }) {
  return (
    <div>
      <label className="ms-overline block mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function AlignPicker({ value = "left", onChange }) {
  const opts = [
    { v: "left", icon: AlignLeft },
    { v: "center", icon: AlignCenter },
    { v: "right", icon: AlignRight },
  ];
  return (
    <div>
      <label className="ms-overline block mb-1.5">Alignement</label>
      <div className="flex rounded-xl bg-[#F4F7FA] p-1 w-max">
        {opts.map((o) => {
          const I = o.icon;
          return (
            <button key={o.v} onClick={() => onChange(o.v)} className={`h-8 w-8 rounded-lg flex items-center justify-center transition-colors ${value === o.v ? "bg-white shadow" : "text-[#475569]"}`}>
              <I className="h-4 w-4" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ColorPicker({ label, value, onChange }) {
  const swatches = ["#071B34", "#0B2545", "#3BA4FF", "#1D70B8", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#ffffff", "#334155", "#F4F7FA"];
  return (
    <div>
      <label className="ms-overline block mb-1.5">{label}</label>
      <div className="flex items-center gap-2 flex-wrap">
        {swatches.map((s) => (
          <button key={s} onClick={() => onChange(s)} className={`h-6 w-6 rounded-full border-2 ${value === s ? "border-[#3BA4FF] ring-2 ring-[#3BA4FF]/30" : "border-[#071B34]/10"}`} style={{ background: s }} />
        ))}
        <input type="color" value={value || "#000000"} onChange={(e) => onChange(e.target.value)} className="h-6 w-6 rounded cursor-pointer" />
      </div>
    </div>
  );
}

// ─── Preview (WYSIWYG full page) ───────────────────────────────────
function NewsletterPreview({ f }) {
  const cover = absoluteUrl(f.cover_image);
  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div
        className="relative rounded-3xl overflow-hidden bg-[#071B34] text-white p-10 min-h-[240px] flex flex-col justify-end"
        style={{ backgroundImage: cover ? `linear-gradient(180deg, rgba(7,27,52,0.15), rgba(7,27,52,0.9)), url(${cover})` : undefined, backgroundSize: "cover", backgroundPosition: "center" }}
      >
        <div className="text-[10px] uppercase tracking-widest opacity-80">Newsletter interne · {f.category}</div>
        <h1 className="mt-2 text-4xl font-bold">{f.title || "Titre à définir"}</h1>
        {f.subject && <p className="mt-2 opacity-90">{f.subject}</p>}
      </div>
      <div className="ms-card p-6 md:p-10 space-y-6">
        {(f.blocks || []).map((b) => <RenderBlock key={b.id} b={b} />)}
        {(!f.blocks || f.blocks.length === 0) && <p className="text-[#475569] italic">Aucun bloc ajouté.</p>}
      </div>
    </div>
  );
}
