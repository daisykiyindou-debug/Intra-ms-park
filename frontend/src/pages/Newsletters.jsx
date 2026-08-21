import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Mail, Search, Bell, Bookmark, Plus, ArrowLeft, Clock, Paperclip, Archive,
  MoreVertical, Save, X, Edit3, Trash2, Send, GripVertical, Type, Heading1,
  Image as ImageIcon, MousePointerClick, Minus, Columns2, Palette, Copy,
  Eye, ChevronUp, ChevronDown, AlignLeft, AlignCenter, AlignRight,
  Video, Images, Smile, Sparkles, LayoutGrid, Columns3, Square, Circle,
  SquareStack, MoveVertical, Award, Star, Heart, Zap, Rocket, ThumbsUp,
  Users, Calendar, MapPin, Coffee, Gift, TrendingUp, Target, CheckCircle2,
  Play as PlayIcon,
} from "lucide-react";
import { toast } from "sonner";
import { api, formatDateFr, absoluteUrl } from "@/lib/api";
import { useApp, hasPermission } from "@/contexts/AppContext";
import PortalModal from "@/components/PortalModal";

const CATEGORIES = ["Général", "RH", "Événement", "Projet", "Procédure", "Ouverture"];
const uid = () => Math.random().toString(36).slice(2, 10);

// Icon library available in the icon block picker
const ICON_LIBRARY = {
  award: Award, star: Star, heart: Heart, zap: Zap, rocket: Rocket, "thumbs-up": ThumbsUp,
  users: Users, calendar: Calendar, "map-pin": MapPin, coffee: Coffee, gift: Gift,
  "trending-up": TrendingUp, target: Target, "check-circle": CheckCircle2, sparkles: Sparkles,
};

const EMOJI_LIBRARY = ["🎉", "🎊", "🎈", "🎁", "🎂", "🥳", "🚀", "⭐", "💡", "💪", "🔥", "❤️", "💙", "💚", "✨", "👏", "🙌", "👋", "🍕", "☕", "🏆", "📢", "📅", "📌", "✅", "🎯", "💼", "🌟"];

// ═══════════════════════════════════════════════════════════════════
// Block registry (rich set for Canva/Mailchimp-like editor)
// ═══════════════════════════════════════════════════════════════════
const BLOCK_TYPES = {
  heading:  { label: "Titre",       icon: Heading1,        cat: "Texte",   def: () => ({ text: "Titre de la section", level: 2, align: "left", color: "#071B34", weight: "bold" }) },
  text:     { label: "Texte",       icon: Type,            cat: "Texte",   def: () => ({ text: "Écrivez votre paragraphe ici.", align: "left", color: "#334155", size: "base" }) },
  image:    { label: "Image",       icon: ImageIcon,       cat: "Média",   def: () => ({ url: "", caption: "", shape: "rounded", align: "center", width: 100 }) },
  gallery:  { label: "Galerie",     icon: Images,          cat: "Média",   def: () => ({ images: [], columns: 3, gap: 8, shape: "rounded" }) },
  video:    { label: "Vidéo",       icon: Video,           cat: "Média",   def: () => ({ url: "", provider: "youtube", caption: "" }) },
  gif:      { label: "GIF",         icon: PlayIcon,        cat: "Média",   def: () => ({ url: "", align: "center", shape: "rounded", width: 100 }) },
  icon:     { label: "Icône",       icon: Sparkles,        cat: "Média",   def: () => ({ name: "star", size: 48, color: "#3BA4FF", align: "center", label: "" }) },
  emoji:    { label: "Emoji",       icon: Smile,           cat: "Média",   def: () => ({ char: "🎉", size: 64, align: "center" }) },
  button:   { label: "Bouton",      icon: MousePointerClick, cat: "Action", def: () => ({ text: "En savoir plus", url: "https://", align: "center", bg: "#3BA4FF", color: "#ffffff", shape: "rounded", size: "md" }) },
  divider:  { label: "Séparateur",  icon: Minus,           cat: "Structure", def: () => ({ style: "solid", color: "#E5E7EB" }) },
  spacer:   { label: "Espace",      icon: MoveVertical,    cat: "Structure", def: () => ({ height: 24 }) },
  columns:  { label: "2 colonnes",  icon: Columns2,        cat: "Layout",  def: () => ({ layout: "image-text", image: "", title: "Titre", text: "Description.", reverse: false, bg: "", shape: "rounded", buttonText: "", buttonUrl: "" }) },
  columns3: { label: "3 colonnes",  icon: Columns3,        cat: "Layout",  def: () => ({ items: [
    { image: "", title: "Titre 1", text: "Description.", buttonText: "Lire plus", buttonUrl: "" },
    { image: "", title: "Titre 2", text: "Description.", buttonText: "Lire plus", buttonUrl: "" },
    { image: "", title: "Titre 3", text: "Description.", buttonText: "Lire plus", buttonUrl: "" },
  ], shape: "rounded" }) },
  card:     { label: "Carte",       icon: SquareStack,     cat: "Layout",  def: () => ({ image: "", overline: "SPECIAL OFFER", title: "Titre de la carte", text: "Description détaillée.", buttonText: "En savoir plus", buttonUrl: "", bg: "#F4F7FA", layout: "image-left" }) },
  stats:    { label: "Statistiques", icon: LayoutGrid,     cat: "Layout",  def: () => ({ bg: "#3BA4FF", color: "#ffffff", items: [
    { value: "1200", label: "STUDENTS" }, { value: "750", label: "COURSES" },
    { value: "25", label: "AWARDS" }, { value: "1200", label: "HOURS" },
  ] }) },
  hero:     { label: "Bloc hero",   icon: Palette,         cat: "Layout",  def: () => ({ title: "Discover a hidden world", subtitle: "Meander through verdant forests…", bg: "#0B2545", color: "#ffffff", image: "", buttonText: "Let's go!", buttonUrl: "", height: "medium" }) },
  cta:      { label: "CTA double",  icon: MousePointerClick, cat: "Action", def: () => ({ bg: "#E9E5FF",
    primary: { text: "Book tour right now", url: "https://", bg: "#0F172A", color: "#ffffff" },
    secondary: { text: "Save tour for later", url: "https://", bg: "transparent", color: "#0F172A" } }) },
};

const BLOCK_CATEGORIES = ["Texte", "Média", "Action", "Layout", "Structure"];

// ═══════════════════════════════════════════════════════════════════
// LIST PAGE
// ═══════════════════════════════════════════════════════════════════
export default function NewslettersList() {
  const { me, adminMode } = useApp();
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [tab, setTab] = useState("published");
  const navigate = useNavigate();
  const isEditor = (me?.is_admin || me?.can_manage_communication || hasPermission(me, "manage_newsletter")) && adminMode !== false;

  const load = async () => {
    const params = new URLSearchParams({ archived: tab === "archived" });
    if (category !== "all") params.set("category", category);
    if (q) params.set("q", q);
    const { data } = await api.get(`/newsletters?${params}`);
    // Hide drafts when not in admin/editor mode (even if backend returned them for own author)
    setItems(isEditor ? data : data.filter((n) => n.published));
  };
  useEffect(() => { load(); }, [tab, category, q, isEditor]); // eslint-disable-line

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
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const menuBtnRef = useRef(null);
  const [bookmarked, setBookmarked] = useState(!!nl.bookmarked);
  const cover = absoluteUrl(nl.cover_image);
  const isRead = !!nl.me_read;

  const openMenu = (e) => {
    e.stopPropagation();
    const rect = menuBtnRef.current?.getBoundingClientRect();
    if (rect) setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    setMenu((v) => !v);
  };

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menu]);

  const toggleBookmark = async (e) => {
    e.stopPropagation();
    try {
      const { data } = await api.post(`/newsletters/${nl.id}/bookmark`);
      setBookmarked(data.bookmarked);
      toast.success(data.bookmarked ? "Ajouté aux signets" : "Retiré des signets");
    } catch { toast.error("Erreur"); }
  };

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
            {isNew && !isRead && <span className="ms-chip bg-[#10B981]/15 text-[#047857] !text-[10px]">Nouveau</span>}
            {isRead && <span className="ms-chip bg-[#94A3B8]/15 text-[#475569] !text-[10px]">Lue</span>}
            {nl.archived && <span className="ms-chip bg-[#94A3B8]/15 text-[#475569] !text-[10px]">Archivée</span>}
            {!nl.published && <span className="ms-chip bg-[#F59E0B]/15 text-[#B45309] !text-[10px]">Brouillon</span>}
          </div>
          <div className="text-xs text-[#475569] mt-1">
            📅 {nl.published_at ? formatDateFr(nl.published_at.slice(0, 10)) : "Non publié"} · {nl.reading_time || 3} min de lecture
          </div>
          <p className="text-sm text-[#475569] mt-2 line-clamp-2">{nl.preheader || nl.subject}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => navigate(`/newsletters/${nl.id}`)}
            data-testid={`nl-read-${nl.id}`}
            className={`rounded-xl text-sm font-semibold px-4 py-2 transition-colors ${
              isRead
                ? "bg-[#F4F7FA] text-[#334155] border border-[#071B34]/10 hover:bg-[#071B34]/5"
                : "bg-[#071B34] text-white hover:bg-[#0B2545]"
            }`}
          >
            {isRead ? "Newsletter déjà lue" : "Lire la newsletter"}
          </button>
          <button
            onClick={toggleBookmark}
            data-testid={`nl-bookmark-${nl.id}`}
            title={bookmarked ? "Retirer des signets" : "Ajouter aux signets"}
            className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${bookmarked ? "text-[#3BA4FF] bg-[#3BA4FF]/10" : "text-[#475569] hover:bg-[#071B34]/5"}`}
          >
            <Bookmark className={`h-4 w-4 ${bookmarked ? "fill-[#3BA4FF]" : ""}`} />
          </button>
          {isEditor && (
            <button ref={menuBtnRef} onClick={openMenu} data-testid={`nl-menu-${nl.id}`} className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[#071B34]/5">
              <MoreVertical className="h-4 w-4" />
            </button>
          )}
          {menu && isEditor && (
            <PortalModal>
              <div
                onClick={(e) => e.stopPropagation()}
                style={{ top: `${menuPos.top}px`, right: `${menuPos.right}px` }}
                className="fixed z-[60] w-48 rounded-xl bg-white shadow-2xl border border-[#071B34]/8 py-1 text-sm"
              >
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
            </PortalModal>
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
const SHAPES = {
  square: "rounded-none",
  rounded: "rounded-2xl",
  "rounded-xl": "rounded-xl",
  "rounded-lg": "rounded-lg",
  "rounded-3xl": "rounded-3xl",
  circle: "rounded-full aspect-square",
};

function _shapeClass(shape) { return SHAPES[shape] || SHAPES.rounded; }

function _ytEmbed(url) {
  if (!url) return "";
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]+)/);
  if (m) return `https://www.youtube.com/embed/${m[1]}`;
  const v = url.match(/vimeo\.com\/(\d+)/);
  if (v) return `https://player.vimeo.com/video/${v[1]}`;
  return url;
}

function RenderBlock({ b }) {
  const p = b.props || {};
  const align = p.align || "left";
  const alignCls = { left: "text-left", center: "text-center", right: "text-right" }[align] || "text-left";
  const alignFlex = { left: "justify-start", center: "justify-center", right: "justify-end" }[align] || "justify-center";

  if (b.type === "heading") {
    const Tag = `h${p.level || 2}`;
    const size = { 1: "text-3xl md:text-5xl", 2: "text-2xl md:text-4xl", 3: "text-xl md:text-2xl" }[p.level || 2];
    return <Tag className={`${size} ${p.weight === "normal" ? "font-normal" : "font-bold"} ${alignCls} leading-tight`} style={{ color: p.color || "#071B34" }}>{p.text}</Tag>;
  }
  if (b.type === "text") {
    const sizeCls = { sm: "text-sm", base: "text-base", lg: "text-lg" }[p.size || "base"];
    return <p className={`${sizeCls} leading-relaxed whitespace-pre-wrap ${alignCls}`} style={{ color: p.color || "#334155" }}>{p.text}</p>;
  }
  if (b.type === "image") {
    if (!p.url) return <div className="rounded-2xl bg-[#F4F7FA] p-8 text-center text-xs text-[#94A3B8]">Aucune image sélectionnée</div>;
    const width = p.width || 100;
    return (
      <div className={`flex ${alignFlex}`}>
        <figure style={{ width: `${width}%` }}>
          <img src={absoluteUrl(p.url)} alt={p.caption || ""} className={`w-full object-cover ${_shapeClass(p.shape)} ${p.shape === "circle" ? "aspect-square" : "max-h-[480px]"}`} />
          {p.caption && <figcaption className="text-xs text-[#94A3B8] mt-2 italic text-center">{p.caption}</figcaption>}
        </figure>
      </div>
    );
  }
  if (b.type === "gallery") {
    if (!p.images?.length) return <div className="rounded-2xl bg-[#F4F7FA] p-8 text-center text-xs text-[#94A3B8]">Aucune image dans la galerie</div>;
    const cols = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4" }[p.columns || 3];
    return (
      <div className={`grid ${cols} gap-${(p.gap || 8) === 4 ? "1" : (p.gap || 8) === 12 ? "3" : "2"}`}>
        {p.images.map((im, i) => (
          <img key={i} src={absoluteUrl(im.url || im)} alt="" className={`w-full object-cover aspect-square ${_shapeClass(p.shape)}`} />
        ))}
      </div>
    );
  }
  if (b.type === "video") {
    if (!p.url) return <div className="rounded-2xl bg-[#F4F7FA] p-8 text-center text-xs text-[#94A3B8]">URL vidéo manquante</div>;
    return (
      <figure className="text-center">
        <div className="aspect-video rounded-2xl overflow-hidden bg-black">
          <iframe title="video" src={_ytEmbed(p.url)} allowFullScreen className="w-full h-full" />
        </div>
        {p.caption && <figcaption className="text-xs text-[#94A3B8] mt-2 italic">{p.caption}</figcaption>}
      </figure>
    );
  }
  if (b.type === "gif") {
    if (!p.url) return <div className="rounded-2xl bg-[#F4F7FA] p-8 text-center text-xs text-[#94A3B8]">URL du GIF manquante</div>;
    const width = p.width || 60;
    return (
      <div className={`flex ${alignFlex}`}>
        <img src={p.url} alt="GIF" className={`object-cover ${_shapeClass(p.shape)}`} style={{ width: `${width}%` }} />
      </div>
    );
  }
  if (b.type === "icon") {
    const I = ICON_LIBRARY[p.name] || Star;
    return (
      <div className={`flex flex-col items-${align === "left" ? "start" : align === "right" ? "end" : "center"}`}>
        <I style={{ width: p.size || 48, height: p.size || 48, color: p.color || "#3BA4FF" }} strokeWidth={1.5} />
        {p.label && <div className={`mt-2 text-sm ${alignCls}`} style={{ color: p.color || "#3BA4FF" }}>{p.label}</div>}
      </div>
    );
  }
  if (b.type === "emoji") {
    return (
      <div className={alignCls} style={{ fontSize: `${p.size || 64}px`, lineHeight: 1 }}>
        {p.char || "🎉"}
      </div>
    );
  }
  if (b.type === "button") {
    const sizeCls = { sm: "px-4 py-2 text-sm", md: "px-6 py-3 text-base", lg: "px-8 py-4 text-lg" }[p.size || "md"];
    const shapeCls = { rounded: "rounded-xl", pill: "rounded-full", square: "rounded-none" }[p.shape || "rounded"];
    return (
      <div className={alignCls}>
        <a href={p.url || "#"} target="_blank" rel="noreferrer" className={`inline-block ${sizeCls} ${shapeCls} font-semibold shadow-md hover:opacity-90 transition-opacity`}
           style={{ background: p.bg || "#3BA4FF", color: p.color || "#fff" }}>
          {p.text || "Bouton"}
        </a>
      </div>
    );
  }
  if (b.type === "cta") {
    return (
      <div className="rounded-2xl p-6 md:p-8 flex flex-col md:flex-row items-center justify-center gap-4" style={{ background: p.bg || "#E9E5FF" }}>
        <a href={p.primary?.url || "#"} target="_blank" rel="noreferrer" className="rounded-xl px-8 py-3 font-semibold text-center min-w-[220px]" style={{ background: p.primary?.bg || "#0F172A", color: p.primary?.color || "#fff" }}>{p.primary?.text || "Action principale"}</a>
        <a href={p.secondary?.url || "#"} target="_blank" rel="noreferrer" className="rounded-xl px-8 py-3 font-semibold text-center min-w-[220px] border-2" style={{ background: p.secondary?.bg || "transparent", color: p.secondary?.color || "#0F172A", borderColor: p.secondary?.color || "#0F172A" }}>{p.secondary?.text || "Action secondaire"}</a>
      </div>
    );
  }
  if (b.type === "divider") {
    return <hr className={`border-t-2 my-2`} style={{ borderColor: p.color || "#E5E7EB", borderStyle: p.style || "solid" }} />;
  }
  if (b.type === "spacer") {
    return <div style={{ height: `${p.height || 24}px` }} />;
  }
  if (b.type === "columns") {
    const layout = p.layout || "image-text";
    const shape = _shapeClass(p.shape);
    const bg = p.bg ? { background: p.bg, padding: "1.5rem", borderRadius: "1rem" } : {};
    const renderCell = (what) => {
      if (what === "image") return p.image ? <img src={absoluteUrl(p.image)} alt="" className={`w-full object-cover max-h-72 ${shape}`} /> : <div className={`w-full aspect-video bg-[#F4F7FA] ${shape}`} />;
      if (what === "image2") return p.image2 ? <img src={absoluteUrl(p.image2)} alt="" className={`w-full object-cover max-h-72 ${shape}`} /> : <div className={`w-full aspect-video bg-[#F4F7FA] ${shape}`} />;
      if (what === "text") return (
        <div>
          <h3 className="text-xl md:text-2xl font-bold" style={{ color: p.color || "#071B34" }}>{p.title}</h3>
          <p className="text-sm mt-2 whitespace-pre-wrap" style={{ color: p.textColor || "#475569" }}>{p.text}</p>
          {p.buttonText && (
            <a href={p.buttonUrl || "#"} target="_blank" rel="noreferrer" className="mt-3 inline-block rounded-lg px-4 py-2 font-semibold text-sm border-2" style={{ borderColor: p.color || "#071B34", color: p.color || "#071B34" }}>{p.buttonText}</a>
          )}
        </div>
      );
      return null;
    };
    const parts = layout === "text-image" ? ["text", "image"]
      : layout === "image-image" ? ["image", "image2"]
      : ["image", "text"];
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center" style={bg}>
        <div>{renderCell(parts[0])}</div>
        <div>{renderCell(parts[1])}</div>
      </div>
    );
  }
  if (b.type === "columns3") {
    const shape = _shapeClass(p.shape);
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(p.items || []).map((it, i) => (
          <div key={i} className="rounded-2xl overflow-hidden bg-white border border-[#071B34]/5 shadow-sm">
            {it.image ? <img src={absoluteUrl(it.image)} alt="" className={`w-full h-40 object-cover ${shape === "rounded-full" ? "" : ""}`} /> : <div className="w-full h-40 bg-[#F4F7FA]" />}
            <div className="p-4">
              <h4 className="font-bold text-[#071B34]">{it.title}</h4>
              <p className="text-xs text-[#475569] mt-1">{it.text}</p>
              {it.buttonText && (
                <a href={it.buttonUrl || "#"} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs font-semibold border-b border-[#071B34]">{it.buttonText}</a>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (b.type === "card") {
    const shape = _shapeClass(p.shape || "rounded-xl");
    const image = p.image ? absoluteUrl(p.image) : null;
    const layout = p.layout || "image-left"; // image-left | image-right | image-top
    return (
      <div className="rounded-3xl p-6 md:p-8" style={{ background: p.bg || "#F4F7FA" }}>
        <div className={`grid gap-6 ${layout === "image-top" ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2"} items-center`}>
          <div className={layout === "image-right" ? "md:order-2" : ""}>
            {image && <img src={image} alt="" className={`w-full object-cover ${shape} ${layout === "image-top" ? "max-h-80" : "max-h-72"}`} />}
          </div>
          <div>
            {p.overline && <div className="text-xs font-bold tracking-widest uppercase text-[#EF4444]">{p.overline}</div>}
            <h3 className="text-2xl md:text-3xl font-bold text-[#071B34] mt-2">{p.title}</h3>
            <p className="text-sm text-[#475569] mt-3 whitespace-pre-wrap leading-relaxed">{p.text}</p>
            {p.buttonText && (
              <a href={p.buttonUrl || "#"} target="_blank" rel="noreferrer" className="mt-4 inline-block rounded-lg px-6 py-2.5 font-semibold text-sm border-2 border-[#071B34] text-[#071B34] hover:bg-[#071B34] hover:text-white transition-colors">
                {p.buttonText}
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }
  if (b.type === "stats") {
    return (
      <div className="rounded-3xl p-6 md:p-10 grid grid-cols-2 md:grid-cols-4 gap-4 text-center" style={{ background: p.bg || "#3BA4FF", color: p.color || "#ffffff" }}>
        {(p.items || []).map((it, i) => (
          <div key={i}>
            <div className="text-3xl md:text-5xl font-bold">{it.value}</div>
            <div className="text-[10px] md:text-xs uppercase tracking-widest mt-1 opacity-90">{it.label}</div>
          </div>
        ))}
      </div>
    );
  }
  if (b.type === "hero") {
    const bg = absoluteUrl(p.image);
    const heightCls = { small: "min-h-[220px]", medium: "min-h-[360px]", large: "min-h-[480px]" }[p.height || "medium"];
    return (
      <div className={`rounded-3xl p-10 md:p-14 flex flex-col items-center justify-center text-center overflow-hidden ${heightCls}`}
           style={{
             background: bg
               ? `linear-gradient(180deg, ${hexAlpha(p.bg || "#0B2545", 0.35)}, ${hexAlpha(p.bg || "#0B2545", 0.75)}), url(${bg}) center/cover`
               : (p.bg || "#0B2545"),
             color: p.color || "#fff",
           }}>
        <h2 className="text-3xl md:text-5xl font-bold max-w-3xl">{p.title}</h2>
        {p.subtitle && <p className="mt-4 opacity-90 max-w-2xl leading-relaxed">{p.subtitle}</p>}
        {p.buttonText && (
          <a href={p.buttonUrl || "#"} target="_blank" rel="noreferrer" className="mt-6 inline-block rounded-xl bg-white text-[#071B34] font-semibold px-8 py-3 hover:opacity-90">
            {p.buttonText}
          </a>
        )}
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
  const { me, adminMode } = useApp();
  const isNew = !id || id === "new";
  const canEdit = (me?.is_admin || me?.can_manage_communication || hasPermission(me, "manage_newsletter")) && adminMode !== false;

  useEffect(() => {
    // Guard: if user disabled admin mode, kick back to list
    if (me && !canEdit) navigate("/newsletters", { replace: true });
  }, [me, canEdit, navigate]);

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
        const nl = r.data;
        // Convert publish_at ISO → datetime-local (YYYY-MM-DDTHH:MM in local time)
        if (nl.publish_at) {
          const d = new Date(nl.publish_at);
          const pad = (n) => String(n).padStart(2, "0");
          nl.publish_at = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        }
        setF({ ...nl, blocks: nl.blocks || [] });
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

  // Drag reorder OR insert new block from palette
  const dragId = useRef(null);
  const [dropTarget, setDropTarget] = useState(null); // block id where the "before" indicator shows
  const insertNewBlock = (type, atIndex = null) => {
    const nb = { id: uid(), type, props: BLOCK_TYPES[type].def() };
    setF((s) => {
      const blocks = [...s.blocks];
      if (atIndex == null || atIndex >= blocks.length) blocks.push(nb);
      else blocks.splice(atIndex, 0, nb);
      return { ...s, blocks };
    });
    setSelectedId(nb.id);
  };
  const onDragStart = (blockId) => (e) => {
    dragId.current = blockId;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("newsletter/reorder", blockId);
  };
  const onDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = e.dataTransfer.types.includes("newsletter/new-block") ? "copy" : "move"; };
  const onDrop = (targetId) => (e) => {
    e.preventDefault();
    setDropTarget(null);
    const newType = e.dataTransfer.getData("newsletter/new-block");
    if (newType) {
      const idx = f.blocks.findIndex((b) => b.id === targetId);
      insertNewBlock(newType, idx);
      return;
    }
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
  const onDropEnd = (e) => {
    e.preventDefault();
    setDropTarget(null);
    const newType = e.dataTransfer.getData("newsletter/new-block");
    if (newType) insertNewBlock(newType);
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
    // If a future publish_at is set AND we're publishing, keep publish_at.
    // If publishing immediately (no schedule), clear publish_at.
    const now = new Date();
    const scheduled = publish && f.publish_at && new Date(f.publish_at) > now;
    const payload = {
      ...f,
      published: publish || f.published,
      publish_at: scheduled ? new Date(f.publish_at).toISOString() : null,
    };
    try {
      if (isNew) {
        const { data } = await api.post("/admin/newsletters", payload);
        toast.success(scheduled ? "Newsletter programmée" : (publish ? "Newsletter publiée" : "Brouillon enregistré"));
        navigate(`/newsletters/${data.id}/edit`, { replace: true });
      } else {
        await api.put(`/admin/newsletters/${id}`, payload);
        toast.success(scheduled ? "Newsletter programmée" : (publish ? "Newsletter publiée" : "Enregistré"));
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
          {f.title || "Nouvelle newsletter"}
          {!f.published && <span className="ml-2 ms-chip !text-[10px] bg-[#F59E0B]/15 text-[#B45309]">Brouillon</span>}
          {f.publish_at && new Date(f.publish_at) > new Date() && (
            <span className="ml-2 ms-chip !text-[10px] bg-[#F59E0B]/15 text-[#B45309]">
              <Clock className="h-3 w-3" /> Programmée
            </span>
          )}
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <div className="flex items-center gap-1.5 rounded-xl bg-[#F4F7FA] px-2 py-1.5">
            <Clock className="h-3.5 w-3.5 text-[#475569]" />
            <input
              type="datetime-local"
              value={f.publish_at || ""}
              onChange={(e) => setF((s) => ({ ...s, publish_at: e.target.value }))}
              data-testid="nl-publish-at"
              className="bg-transparent text-xs outline-none text-[#071B34]"
              title="Date & heure de publication programmée (vide = immédiat)"
            />
            {f.publish_at && (
              <button
                type="button"
                onClick={() => setF((s) => ({ ...s, publish_at: "" }))}
                className="text-[10px] font-semibold text-[#475569] hover:text-[#EF4444]"
              >
                ✕
              </button>
            )}
          </div>
          <button onClick={() => setPreviewMode((v) => !v)} data-testid="nl-preview-toggle" className="ms-btn-outline"><Eye className="h-4 w-4" /> {previewMode ? "Éditer" : "Aperçu"}</button>
          <button onClick={() => save(false)} data-testid="nl-save-draft" className="ms-btn-outline"><Save className="h-4 w-4" /> Brouillon</button>
          <button onClick={() => save(true)} data-testid="nl-publish" className="ms-btn-primary">
            <Send className="h-4 w-4" />
            {f.publish_at && new Date(f.publish_at) > new Date() ? "Programmer" : "Publier"}
          </button>
        </div>
      </div>

      {previewMode ? (
        <NewsletterPreview f={f} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr_320px] gap-4">
          {/* LEFT: Block palette (grouped by category, draggable to canvas) */}
          <div className="ms-card p-3 h-max lg:sticky lg:top-24 max-h-[80vh] overflow-y-auto">
            <div className="ms-overline px-2 py-1.5 mb-1">Blocs · Cliquer ou glisser</div>
            {BLOCK_CATEGORIES.map((cat) => {
              const entries = Object.entries(BLOCK_TYPES).filter(([, cfg]) => cfg.cat === cat);
              if (entries.length === 0) return null;
              return (
                <div key={cat} className="mb-3">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-[#94A3B8] px-2 pt-1 pb-1">{cat}</div>
                  <div className="grid grid-cols-2 gap-1">
                    {entries.map(([key, cfg]) => {
                      const Icon = cfg.icon;
                      return (
                        <button
                          key={key}
                          onClick={() => addBlock(key)}
                          draggable
                          onDragStart={(e) => { e.dataTransfer.setData("newsletter/new-block", key); e.dataTransfer.effectAllowed = "copy"; }}
                          data-testid={`nl-add-${key}`}
                          className="flex flex-col items-center gap-1 rounded-xl px-2 py-3 hover:bg-[#3BA4FF]/10 border border-transparent hover:border-[#3BA4FF]/30 text-xs text-[#071B34] transition-colors cursor-grab active:cursor-grabbing"
                        >
                          <Icon className="h-5 w-5 text-[#3BA4FF]" />
                          <span className="text-center leading-tight">{cfg.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
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
                <div
                  onDragOver={onDragOver}
                  onDrop={onDropEnd}
                  className="rounded-2xl border-2 border-dashed border-[#3BA4FF]/30 p-10 text-center text-sm text-[#475569] hover:border-[#3BA4FF] hover:bg-[#3BA4FF]/5"
                >
                  <div className="text-3xl mb-2">📥</div>
                  Glissez un bloc depuis la palette de gauche, ou cliquez dessus pour commencer votre newsletter.
                </div>
              )}
              <div className="space-y-3" onDragOver={onDragOver} onDrop={onDropEnd}>
                {f.blocks.map((b, i) => (
                  <div
                    key={b.id}
                    draggable
                    onDragStart={onDragStart(b.id)}
                    onDragOver={(e) => { onDragOver(e); setDropTarget(b.id); }}
                    onDragLeave={() => setDropTarget(null)}
                    onDrop={onDrop(b.id)}
                    onClick={() => setSelectedId(b.id)}
                    data-testid={`nl-block-${b.id}`}
                    className={`group relative rounded-2xl border-2 bg-white transition-all cursor-pointer ${selectedId === b.id ? "border-[#3BA4FF] shadow-md" : "border-transparent hover:border-[#3BA4FF]/30"} ${dropTarget === b.id ? "ring-2 ring-[#3BA4FF] ring-offset-2" : ""}`}
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
                {f.blocks.length > 0 && (
                  <div className="rounded-xl border-2 border-dashed border-[#3BA4FF]/20 p-4 text-center text-xs text-[#94A3B8]">
                    Glissez ici pour ajouter un bloc à la fin
                  </div>
                )}
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
function ShapePicker({ value, onChange, options }) {
  const opts = options || [
    { v: "square", l: "Carré" },
    { v: "rounded-lg", l: "Arrondi" },
    { v: "rounded", l: "Arrondi +" },
    { v: "rounded-3xl", l: "Très arrondi" },
    { v: "circle", l: "Cercle" },
  ];
  return (
    <div>
      <label className="ms-overline block mb-1.5">Forme</label>
      <div className="grid grid-cols-5 gap-1">
        {opts.map((o) => (
          <button key={o.v} onClick={() => onChange(o.v)} title={o.l}
            className={`h-9 flex items-center justify-center text-[10px] font-semibold transition-colors ${value === o.v ? "bg-[#3BA4FF] text-white" : "bg-[#F4F7FA] text-[#334155]"} ${SHAPES[o.v] || "rounded-xl"}`}>
            {o.l.charAt(0)}
          </button>
        ))}
      </div>
    </div>
  );
}

function IconPicker({ value, onChange }) {
  return (
    <div>
      <label className="ms-overline block mb-1.5">Icône</label>
      <div className="grid grid-cols-5 gap-1 max-h-40 overflow-y-auto">
        {Object.entries(ICON_LIBRARY).map(([k, I]) => (
          <button key={k} onClick={() => onChange(k)}
            className={`h-9 rounded-lg flex items-center justify-center transition-colors ${value === k ? "bg-[#3BA4FF] text-white" : "bg-[#F4F7FA] text-[#334155] hover:bg-[#3BA4FF]/10"}`}>
            <I className="h-4 w-4" />
          </button>
        ))}
      </div>
    </div>
  );
}

function EmojiPicker({ value, onChange }) {
  return (
    <div>
      <label className="ms-overline block mb-1.5">Emoji</label>
      <div className="grid grid-cols-7 gap-1 max-h-40 overflow-y-auto">
        {EMOJI_LIBRARY.map((e) => (
          <button key={e} onClick={() => onChange(e)}
            className={`h-9 rounded-lg flex items-center justify-center text-xl transition-colors ${value === e ? "bg-[#3BA4FF]/20 ring-2 ring-[#3BA4FF]" : "bg-[#F4F7FA] hover:bg-[#3BA4FF]/10"}`}>
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

function BlockInspector({ block, onUpdate, uploadFile }) {
  const p = block.props || {};
  const upload = async (e, key) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadFile(file);
    onUpdate({ [key]: url });
    toast.success("Image ajoutée");
  };
  const uploadMulti = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const urls = [];
    for (const f of files) urls.push({ url: await uploadFile(f) });
    onUpdate({ images: [...(p.images || []), ...urls] });
    toast.success(`${files.length} image(s) ajoutée(s)`);
  };

  if (block.type === "heading") return (
    <div className="space-y-3">
      <Field label="Texte"><input className="ms-input" value={p.text || ""} onChange={(e) => onUpdate({ text: e.target.value })} data-testid="nl-inspector-text" /></Field>
      <Field label="Niveau">
        <select className="ms-input" value={p.level || 2} onChange={(e) => onUpdate({ level: parseInt(e.target.value) })}>
          <option value={1}>H1 (grand)</option><option value={2}>H2</option><option value={3}>H3</option>
        </select>
      </Field>
      <AlignPicker value={p.align} onChange={(v) => onUpdate({ align: v })} />
      <ColorPicker label="Couleur du texte" value={p.color} onChange={(v) => onUpdate({ color: v })} />
    </div>
  );

  if (block.type === "text") return (
    <div className="space-y-3">
      <Field label="Contenu"><textarea rows={6} className="ms-input" value={p.text || ""} onChange={(e) => onUpdate({ text: e.target.value })} data-testid="nl-inspector-text" /></Field>
      <Field label="Taille">
        <select className="ms-input" value={p.size || "base"} onChange={(e) => onUpdate({ size: e.target.value })}>
          <option value="sm">Petite</option><option value="base">Normale</option><option value="lg">Grande</option>
        </select>
      </Field>
      <AlignPicker value={p.align} onChange={(v) => onUpdate({ align: v })} />
      <ColorPicker label="Couleur du texte" value={p.color} onChange={(v) => onUpdate({ color: v })} />
    </div>
  );

  if (block.type === "image") return (
    <div className="space-y-3">
      {p.url && <img src={absoluteUrl(p.url)} alt="" className={`w-full object-cover max-h-40 ${_shapeClass(p.shape)}`} />}
      <label className="inline-flex items-center gap-1.5 rounded-lg bg-[#3BA4FF] text-white text-xs font-semibold px-3 py-1.5 cursor-pointer">
        <ImageIcon className="h-3 w-3" /> {p.url ? "Remplacer" : "Ajouter"} {"l'image"}
        <input type="file" accept="image/*" className="hidden" onChange={(e) => upload(e, "url")} data-testid="nl-inspector-image-upload" />
      </label>
      <Field label="Légende"><input className="ms-input" value={p.caption || ""} onChange={(e) => onUpdate({ caption: e.target.value })} /></Field>
      <ShapePicker value={p.shape} onChange={(v) => onUpdate({ shape: v })} />
      <Field label={`Largeur : ${p.width || 100}%`}>
        <input type="range" min="20" max="100" step="5" value={p.width || 100} onChange={(e) => onUpdate({ width: parseInt(e.target.value) })} className="w-full" />
      </Field>
      <AlignPicker value={p.align} onChange={(v) => onUpdate({ align: v })} />
    </div>
  );

  if (block.type === "gallery") return (
    <div className="space-y-3">
      <label className="inline-flex items-center gap-1.5 rounded-lg bg-[#3BA4FF] text-white text-xs font-semibold px-3 py-1.5 cursor-pointer">
        <Images className="h-3 w-3" /> Ajouter des images
        <input type="file" accept="image/*" multiple className="hidden" onChange={uploadMulti} />
      </label>
      {(p.images || []).length > 0 && (
        <div className="grid grid-cols-3 gap-1 max-h-40 overflow-y-auto">
          {p.images.map((im, i) => (
            <div key={i} className="relative group">
              <img src={absoluteUrl(im.url || im)} alt="" className="w-full aspect-square object-cover rounded-lg" />
              <button onClick={() => onUpdate({ images: p.images.filter((_, j) => j !== i) })} className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-white shadow opacity-0 group-hover:opacity-100"><X className="h-3 w-3 mx-auto text-[#B91C1C]" /></button>
            </div>
          ))}
        </div>
      )}
      <Field label="Colonnes">
        <select className="ms-input" value={p.columns || 3} onChange={(e) => onUpdate({ columns: parseInt(e.target.value) })}>
          <option value={2}>2 colonnes</option><option value={3}>3 colonnes</option><option value={4}>4 colonnes</option>
        </select>
      </Field>
      <ShapePicker value={p.shape} onChange={(v) => onUpdate({ shape: v })} />
    </div>
  );

  if (block.type === "video") return (
    <div className="space-y-3">
      <Field label="URL YouTube / Vimeo *">
        <input className="ms-input" value={p.url || ""} onChange={(e) => onUpdate({ url: e.target.value })} placeholder="https://youtube.com/watch?v=..." />
      </Field>
      <Field label="Légende"><input className="ms-input" value={p.caption || ""} onChange={(e) => onUpdate({ caption: e.target.value })} /></Field>
    </div>
  );

  if (block.type === "gif") return (
    <div className="space-y-3">
      {p.url && <img src={p.url} alt="" className="w-full rounded-lg max-h-32 object-contain bg-black/5" />}
      <Field label="URL du GIF *"><input className="ms-input" value={p.url || ""} onChange={(e) => onUpdate({ url: e.target.value })} placeholder="https://media.giphy.com/..." /></Field>
      <div className="text-[10px] text-[#94A3B8]">Astuce : cherche un GIF sur <a href="https://giphy.com" target="_blank" rel="noreferrer" className="underline">giphy.com</a>, copie le lien direct.</div>
      <ShapePicker value={p.shape} onChange={(v) => onUpdate({ shape: v })} />
      <Field label={`Largeur : ${p.width || 60}%`}>
        <input type="range" min="20" max="100" step="5" value={p.width || 60} onChange={(e) => onUpdate({ width: parseInt(e.target.value) })} className="w-full" />
      </Field>
      <AlignPicker value={p.align} onChange={(v) => onUpdate({ align: v })} />
    </div>
  );

  if (block.type === "icon") return (
    <div className="space-y-3">
      <IconPicker value={p.name} onChange={(v) => onUpdate({ name: v })} />
      <Field label={`Taille : ${p.size || 48}px`}>
        <input type="range" min="16" max="128" step="4" value={p.size || 48} onChange={(e) => onUpdate({ size: parseInt(e.target.value) })} className="w-full" />
      </Field>
      <ColorPicker label="Couleur" value={p.color} onChange={(v) => onUpdate({ color: v })} />
      <Field label="Légende (optionnel)"><input className="ms-input" value={p.label || ""} onChange={(e) => onUpdate({ label: e.target.value })} /></Field>
      <AlignPicker value={p.align} onChange={(v) => onUpdate({ align: v })} />
    </div>
  );

  if (block.type === "emoji") return (
    <div className="space-y-3">
      <EmojiPicker value={p.char} onChange={(v) => onUpdate({ char: v })} />
      <Field label={`Taille : ${p.size || 64}px`}>
        <input type="range" min="24" max="160" step="4" value={p.size || 64} onChange={(e) => onUpdate({ size: parseInt(e.target.value) })} className="w-full" />
      </Field>
      <AlignPicker value={p.align} onChange={(v) => onUpdate({ align: v })} />
    </div>
  );

  if (block.type === "button") return (
    <div className="space-y-3">
      <Field label="Libellé"><input className="ms-input" value={p.text || ""} onChange={(e) => onUpdate({ text: e.target.value })} data-testid="nl-inspector-btn-text" /></Field>
      <Field label="Lien (URL)"><input className="ms-input" value={p.url || ""} onChange={(e) => onUpdate({ url: e.target.value })} placeholder="https://" /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Taille">
          <select className="ms-input" value={p.size || "md"} onChange={(e) => onUpdate({ size: e.target.value })}>
            <option value="sm">Petit</option><option value="md">Moyen</option><option value="lg">Grand</option>
          </select>
        </Field>
        <Field label="Forme">
          <select className="ms-input" value={p.shape || "rounded"} onChange={(e) => onUpdate({ shape: e.target.value })}>
            <option value="rounded">Arrondi</option><option value="pill">Pill</option><option value="square">Carré</option>
          </select>
        </Field>
      </div>
      <AlignPicker value={p.align} onChange={(v) => onUpdate({ align: v })} />
      <ColorPicker label="Couleur de fond" value={p.bg} onChange={(v) => onUpdate({ bg: v })} />
      <ColorPicker label="Couleur du texte" value={p.color} onChange={(v) => onUpdate({ color: v })} />
    </div>
  );

  if (block.type === "cta") return (
    <div className="space-y-3">
      <ColorPicker label="Fond du bloc" value={p.bg} onChange={(v) => onUpdate({ bg: v })} />
      <div className="rounded-xl bg-[#F4F7FA] p-3 space-y-2">
        <div className="text-[10px] font-bold uppercase text-[#94A3B8]">Bouton principal</div>
        <input className="ms-input" placeholder="Libellé" value={p.primary?.text || ""} onChange={(e) => onUpdate({ primary: { ...p.primary, text: e.target.value } })} />
        <input className="ms-input" placeholder="URL" value={p.primary?.url || ""} onChange={(e) => onUpdate({ primary: { ...p.primary, url: e.target.value } })} />
        <ColorPicker label="Fond" value={p.primary?.bg} onChange={(v) => onUpdate({ primary: { ...p.primary, bg: v } })} />
        <ColorPicker label="Texte" value={p.primary?.color} onChange={(v) => onUpdate({ primary: { ...p.primary, color: v } })} />
      </div>
      <div className="rounded-xl bg-[#F4F7FA] p-3 space-y-2">
        <div className="text-[10px] font-bold uppercase text-[#94A3B8]">Bouton secondaire</div>
        <input className="ms-input" placeholder="Libellé" value={p.secondary?.text || ""} onChange={(e) => onUpdate({ secondary: { ...p.secondary, text: e.target.value } })} />
        <input className="ms-input" placeholder="URL" value={p.secondary?.url || ""} onChange={(e) => onUpdate({ secondary: { ...p.secondary, url: e.target.value } })} />
        <ColorPicker label="Texte" value={p.secondary?.color} onChange={(v) => onUpdate({ secondary: { ...p.secondary, color: v } })} />
      </div>
    </div>
  );

  if (block.type === "divider") return (
    <div className="space-y-3">
      <Field label="Style">
        <select className="ms-input" value={p.style || "solid"} onChange={(e) => onUpdate({ style: e.target.value })}>
          <option value="solid">Trait plein</option><option value="dashed">Tirets</option><option value="dotted">Points</option>
        </select>
      </Field>
      <ColorPicker label="Couleur" value={p.color} onChange={(v) => onUpdate({ color: v })} />
    </div>
  );

  if (block.type === "spacer") return (
    <div className="space-y-3">
      <Field label={`Hauteur : ${p.height || 24}px`}>
        <input type="range" min="4" max="200" step="4" value={p.height || 24} onChange={(e) => onUpdate({ height: parseInt(e.target.value) })} className="w-full" />
      </Field>
    </div>
  );

  if (block.type === "columns") return (
    <div className="space-y-3">
      <Field label="Mise en page">
        <select className="ms-input" value={p.layout || "image-text"} onChange={(e) => onUpdate({ layout: e.target.value })}>
          <option value="image-text">Image gauche · Texte droite</option>
          <option value="text-image">Texte gauche · Image droite</option>
          <option value="image-image">2 images</option>
        </select>
      </Field>
      {(p.layout || "image-text").includes("image") && p.layout !== "image-image" && (
        <>
          {p.image && <img src={absoluteUrl(p.image)} alt="" className={`w-full max-h-24 object-cover ${_shapeClass(p.shape)}`} />}
          <label className="inline-flex items-center gap-1.5 rounded-lg bg-[#3BA4FF] text-white text-xs font-semibold px-3 py-1.5 cursor-pointer">
            <ImageIcon className="h-3 w-3" /> Image
            <input type="file" accept="image/*" className="hidden" onChange={(e) => upload(e, "image")} />
          </label>
        </>
      )}
      {p.layout === "image-image" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="rounded-lg bg-[#F4F7FA] p-2 text-xs text-center cursor-pointer">
              {p.image ? <img src={absoluteUrl(p.image)} alt="" className="h-16 w-full object-cover rounded" /> : "Image 1"}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => upload(e, "image")} />
            </label>
            <label className="rounded-lg bg-[#F4F7FA] p-2 text-xs text-center cursor-pointer">
              {p.image2 ? <img src={absoluteUrl(p.image2)} alt="" className="h-16 w-full object-cover rounded" /> : "Image 2"}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => upload(e, "image2")} />
            </label>
          </div>
        </>
      )}
      {p.layout !== "image-image" && (
        <>
          <Field label="Titre"><input className="ms-input" value={p.title || ""} onChange={(e) => onUpdate({ title: e.target.value })} /></Field>
          <Field label="Texte"><textarea rows={4} className="ms-input" value={p.text || ""} onChange={(e) => onUpdate({ text: e.target.value })} /></Field>
          <Field label="Bouton (optionnel)"><input className="ms-input" placeholder="Libellé" value={p.buttonText || ""} onChange={(e) => onUpdate({ buttonText: e.target.value })} /></Field>
          <input className="ms-input" placeholder="URL du bouton" value={p.buttonUrl || ""} onChange={(e) => onUpdate({ buttonUrl: e.target.value })} />
        </>
      )}
      <ShapePicker value={p.shape} onChange={(v) => onUpdate({ shape: v })} />
      <ColorPicker label="Fond du bloc (optionnel)" value={p.bg} onChange={(v) => onUpdate({ bg: v })} />
    </div>
  );

  if (block.type === "columns3") return (
    <div className="space-y-3">
      {(p.items || []).map((it, i) => (
        <div key={i} className="rounded-xl bg-[#F4F7FA] p-3 space-y-2">
          <div className="text-[10px] font-bold uppercase text-[#94A3B8]">Colonne {i + 1}</div>
          {it.image && <img src={absoluteUrl(it.image)} alt="" className="w-full h-16 object-cover rounded" />}
          <label className="inline-flex items-center gap-1.5 rounded-lg bg-[#3BA4FF] text-white text-[10px] font-semibold px-2 py-1 cursor-pointer">
            <ImageIcon className="h-3 w-3" /> {it.image ? "Remplacer" : "Image"}
            <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
              const url = await uploadFile(e.target.files[0]);
              onUpdate({ items: p.items.map((x, j) => j === i ? { ...x, image: url } : x) });
            }} />
          </label>
          <input className="ms-input text-sm" placeholder="Titre" value={it.title || ""} onChange={(e) => onUpdate({ items: p.items.map((x, j) => j === i ? { ...x, title: e.target.value } : x) })} />
          <textarea rows={2} className="ms-input text-sm" placeholder="Texte" value={it.text || ""} onChange={(e) => onUpdate({ items: p.items.map((x, j) => j === i ? { ...x, text: e.target.value } : x) })} />
          <input className="ms-input text-sm" placeholder="Libellé bouton" value={it.buttonText || ""} onChange={(e) => onUpdate({ items: p.items.map((x, j) => j === i ? { ...x, buttonText: e.target.value } : x) })} />
        </div>
      ))}
      <ShapePicker value={p.shape} onChange={(v) => onUpdate({ shape: v })} />
    </div>
  );

  if (block.type === "card") return (
    <div className="space-y-3">
      {p.image && <img src={absoluteUrl(p.image)} alt="" className={`w-full max-h-32 object-cover ${_shapeClass(p.shape || "rounded-xl")}`} />}
      <label className="inline-flex items-center gap-1.5 rounded-lg bg-[#3BA4FF] text-white text-xs font-semibold px-3 py-1.5 cursor-pointer">
        <ImageIcon className="h-3 w-3" /> Image
        <input type="file" accept="image/*" className="hidden" onChange={(e) => upload(e, "image")} />
      </label>
      <Field label="Mise en page">
        <select className="ms-input" value={p.layout || "image-left"} onChange={(e) => onUpdate({ layout: e.target.value })}>
          <option value="image-left">Image à gauche</option>
          <option value="image-right">Image à droite</option>
          <option value="image-top">Image en haut</option>
        </select>
      </Field>
      <Field label="Surtitre"><input className="ms-input" value={p.overline || ""} onChange={(e) => onUpdate({ overline: e.target.value })} placeholder="SPECIAL OFFER" /></Field>
      <Field label="Titre"><input className="ms-input" value={p.title || ""} onChange={(e) => onUpdate({ title: e.target.value })} /></Field>
      <Field label="Texte"><textarea rows={4} className="ms-input" value={p.text || ""} onChange={(e) => onUpdate({ text: e.target.value })} /></Field>
      <Field label="Bouton"><input className="ms-input" placeholder="Libellé" value={p.buttonText || ""} onChange={(e) => onUpdate({ buttonText: e.target.value })} /></Field>
      <input className="ms-input" placeholder="URL" value={p.buttonUrl || ""} onChange={(e) => onUpdate({ buttonUrl: e.target.value })} />
      <ShapePicker value={p.shape} onChange={(v) => onUpdate({ shape: v })} />
      <ColorPicker label="Fond de la carte" value={p.bg} onChange={(v) => onUpdate({ bg: v })} />
    </div>
  );

  if (block.type === "stats") return (
    <div className="space-y-3">
      <ColorPicker label="Fond" value={p.bg} onChange={(v) => onUpdate({ bg: v })} />
      <ColorPicker label="Texte" value={p.color} onChange={(v) => onUpdate({ color: v })} />
      {(p.items || []).map((it, i) => (
        <div key={i} className="grid grid-cols-2 gap-2">
          <input className="ms-input text-sm" placeholder="Valeur" value={it.value || ""} onChange={(e) => onUpdate({ items: p.items.map((x, j) => j === i ? { ...x, value: e.target.value } : x) })} />
          <input className="ms-input text-sm" placeholder="Label" value={it.label || ""} onChange={(e) => onUpdate({ items: p.items.map((x, j) => j === i ? { ...x, label: e.target.value } : x) })} />
        </div>
      ))}
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
      <Field label="Sous-titre"><textarea rows={2} className="ms-input" value={p.subtitle || ""} onChange={(e) => onUpdate({ subtitle: e.target.value })} /></Field>
      <Field label="Bouton (optionnel)"><input className="ms-input" placeholder="Libellé" value={p.buttonText || ""} onChange={(e) => onUpdate({ buttonText: e.target.value })} /></Field>
      <input className="ms-input" placeholder="URL du bouton" value={p.buttonUrl || ""} onChange={(e) => onUpdate({ buttonUrl: e.target.value })} />
      <Field label="Hauteur">
        <select className="ms-input" value={p.height || "medium"} onChange={(e) => onUpdate({ height: e.target.value })}>
          <option value="small">Petite</option><option value="medium">Moyenne</option><option value="large">Grande</option>
        </select>
      </Field>
      <ColorPicker label="Couleur d'arrière-plan" value={p.bg} onChange={(v) => onUpdate({ bg: v })} />
      <ColorPicker label="Couleur du texte" value={p.color} onChange={(v) => onUpdate({ color: v })} />
    </div>
  );

  return <p className="text-xs text-[#475569] italic">Aucune propriété pour ce bloc.</p>;
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
