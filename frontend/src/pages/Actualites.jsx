import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useSearchParams } from "react-router-dom";
import {
  Heart, MessageCircle, Send, Filter, Eye, EyeOff,
  Image as ImageIcon, Paperclip, Link2, Smile, Sparkles, Trash2, X, Pencil,
  FileText, User as UserIcon, Building2, ChevronDown, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { api, formatDateFr, absoluteUrl } from "@/lib/api";
import { useApp, hasPermission } from "@/contexts/AppContext";
import useLiveData, { notifyLiveRefresh } from "@/hooks/useLiveData";
import RichTextEditor from "@/components/RichTextEditor";
import ImageUpload from "@/components/ImageUpload";

const FILTERS = [
  { k: "all", l: "Toutes" },
  { k: "Direction", l: "Direction" },
  { k: "RH", l: "RH" },
  { k: "Événement", l: "Événements" },
  { k: "Restauration", l: "Restauration" },
];

const categoryColor = {
  Direction: "bg-[#3BA4FF]/15 text-[#1D70B8]",
  Restauration: "bg-[#F59E0B]/15 text-[#B45309]",
  Événement: "bg-[#A78BFA]/15 text-[#7C3AED]",
  RH: "bg-[#10B981]/15 text-[#065F46]",
  annonce: "bg-[#64748B]/15 text-[#475569]",
};

const IMAGE_GALLERY = [
  "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=1200",
  "https://images.unsplash.com/photo-1522860747422-1b3b0e7527ff?w=1200",
  "https://images.unsplash.com/photo-1543083477-4f785aeafaa9?w=1200",
  "https://images.unsplash.com/photo-1571167530149-c72f2a45f57d?w=1200",
  "https://images.unsplash.com/photo-1594736797933-d0501ba2fe65?w=1200",
  "https://images.unsplash.com/photo-1517649763962-0c623066013b?w=1200",
  "https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?w=1200",
  "https://images.unsplash.com/photo-1526397751294-331021109fbd?w=1200",
  "https://images.unsplash.com/photo-1560062330-3d1fce13f1a4?w=1200",
  "https://images.unsplash.com/photo-1533642125100-b585daad1f22?w=1200",
  "https://images.unsplash.com/photo-1503457574462-bd27054394c1?w=1200",
  "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=1200",
];

const EMOJIS = [
  "😀","😄","😊","😍","🤩","🥳","🎉","🎊","🎈","🎁","🏆","⭐",
  "👏","🙌","👍","👌","💪","🔥","💯","✨","💡","💬","📣","📌",
  "❤️","💙","💚","🧡","🤍","🌟","☀️","🌈","🎯","🚀","⚡","🎢",
];

const ATTACHMENTS_LIBRARY = [
  { name: "Modèle contrat CDI.pdf", type: "pdf",
    url: "https://www.africau.edu/images/default/sample.pdf" },
  { name: "Fiche de paie type.pdf", type: "pdf",
    url: "https://www.africau.edu/images/default/sample.pdf" },
  { name: "Règlement intérieur 2026.pdf", type: "pdf",
    url: "https://www.africau.edu/images/default/sample.pdf" },
  { name: "Note de service.docx", type: "word",
    url: "https://www.africau.edu/images/default/sample.pdf" },
  { name: "Planning Q3 2026.xlsx", type: "excel",
    url: "https://www.africau.edu/images/default/sample.pdf" },
];

const OFFICIAL_AVATAR =
  "https://customer-assets-jt897jd0.emergentagent.net/job_mspark-employee-hub/artifacts/7vgenyd4_MS%20PARK%20LOGO%20FOND%20BLEU.png";

export default function Actualites() {
  const { me, findEmployee, adminMode } = useApp();
  const isPoster = !!me?.is_admin || !!me?.can_manage_communication || hasPermission(me, "publish_news", "edit_news");
  const canPublishAsMSPark = isPoster && adminMode !== false;
  const [posts, setPosts] = useState([]);
  const [filter, setFilter] = useState("all");
  const [editingPost, setEditingPost] = useState(null);
  const [lightbox, setLightbox] = useState(null); // { images: [url], index: number } | null
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightId = searchParams.get("post");
  const [highlightPulse, setHighlightPulse] = useState(null);

  const refresh = () => api.get("/posts").then((r) => setPosts(r.data));
  useLiveData(refresh, ["posts", "news"]);

  // Scroll + surbrillance quand on arrive avec `?post=<id>` (depuis carrousel / notif)
  useEffect(() => {
    if (!highlightId || posts.length === 0) return;
    const el = document.querySelector(`[data-testid="post-${highlightId}"]`);
    if (el) {
      // "Éviter la catégorie" — désactiver le filtre si le post n'est pas dedans
      const target = posts.find((p) => p.id === highlightId);
      if (target && filter !== "all" && target.category !== filter) {
        setFilter("all");
        return;
      }
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightPulse(highlightId);
      const t = setTimeout(() => setHighlightPulse(null), 2400);
      return () => clearTimeout(t);
    }
  }, [highlightId, posts, filter]);

  const like = async (id) => {
    await api.post(`/posts/${id}/like`);
    refresh();
  };
  const filtered = useMemo(
    () => (filter === "all" ? posts : posts.filter((p) => p.category === filter)),
    [posts, filter]
  );

  return (
    <div className="space-y-5 ms-fade-up max-w-2xl mx-auto">
      <div>
        <div className="ms-overline">Actualités entreprise</div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[#071B34] mt-1">
          Le fil de MS Park
        </h1>
        <p className="text-sm text-[#475569] mt-2">
          {me?.is_admin && adminMode !== false
            ? "Publiez des annonces, photos, documents pour toute l'équipe. Vous choisissez de poster en votre nom ou au nom de MS Park."
            : me?.is_admin
            ? "Publiez à votre nom sur le fil MS Park. Activez le mode Admin pour publier au nom de MS Park."
            : me?.can_manage_communication
            ? "Publiez, modifiez et supprimez les actualités officielles au nom de MS Park."
            : "Annonces, événements et communication officielle."}
        </p>
      </div>

      {isPoster && <AdminComposer me={me} onPublished={refresh} canUseOfficial={canPublishAsMSPark} />}

      <div className="ms-card p-3 flex flex-wrap items-center gap-1.5">
        <Filter className="h-4 w-4 text-[#475569] mx-1" />
        {FILTERS.map((f) => (
          <button
            key={f.k}
            onClick={() => setFilter(f.k)}
            data-testid={`filter-${f.k}`}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              filter === f.k
                ? "bg-[#071B34] text-white"
                : "bg-[#F4F7FA] text-[#475569] hover:bg-[#071B34]/5"
            }`}
          >
            {f.l}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {filtered.length === 0 && (
          <div className="ms-card p-8 text-center text-sm text-[#475569]">
            Aucune publication dans cette catégorie.
          </div>
        )}
        {filtered.map((p) => (
          <PostCard
            key={p.id}
            post={p}
            me={me}
            onLike={() => like(p.id)}
            findEmployee={findEmployee}
            refresh={refresh}
            setEditingPost={setEditingPost}
            setLightbox={setLightbox}
            canModerate={canPublishAsMSPark}
            autoOpenComments={p.id === highlightId}
            pulseHighlight={p.id === highlightPulse}
          />
        ))}
      </div>

      {editingPost && (
        <PostEditor
          post={editingPost}
          onClose={() => setEditingPost(null)}
          onSaved={() => { setEditingPost(null); refresh(); notifyLiveRefresh(["posts"]); }}
        />
      )}
      {lightbox && (
        <Lightbox
          images={lightbox.images}
          startIndex={lightbox.index}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}

// ────────────────────── Composer

// Reusable audience picker: pick employee statuses (or "Tous") to restrict
// who can see the publication.
const AUDIENCE_STATUSES = [
  { k: "ops", l: "Employé terrain (OPS)" },
  { k: "management", l: "Management" },
  { k: "bureau", l: "Employé Bureau" },
  { k: "direction", l: "Direction" },
  { k: "alternant", l: "Alternant" },
  { k: "stage", l: "Stage" },
  { k: "restauration", l: "Restauration" },
  { k: "securite", l: "Sécurité" },
  { k: "nettoyage", l: "Nettoyage" },
  { k: "maintenance", l: "Maintenance" },
];

export function AudiencePicker({ value = [], onChange }) {
  const all = (value || []).length === 0;
  const toggle = (k) => {
    const s = new Set(value || []);
    if (s.has(k)) s.delete(k); else s.add(k);
    onChange?.(Array.from(s));
  };
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-[#475569] font-semibold mb-1.5 block">
        Cible — qui peut voir ?
      </label>
      <div className="flex flex-wrap gap-1.5" data-testid="audience-picker">
        <button
          type="button"
          onClick={() => onChange?.([])}
          data-testid="audience-all"
          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${all ? "bg-[#3BA4FF] text-white shadow" : "bg-[#F4F7FA] text-[#475569]"}`}
        >
          Tous les employés
        </button>
        {AUDIENCE_STATUSES.map((s) => {
          const on = (value || []).includes(s.k);
          return (
            <button
              key={s.k}
              type="button"
              onClick={() => toggle(s.k)}
              data-testid={`audience-${s.k}`}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${on ? "bg-[#7C3AED] text-white shadow" : "bg-[#F4F7FA] text-[#475569]"}`}
            >
              {s.l}
            </button>
          );
        })}
      </div>
      <div className="text-[10px] text-[#94A3B8] mt-1">
        {all ? "Visible par toute l'entreprise." : `Visible uniquement par les employés ayant l'un des statuts sélectionnés.`}
      </div>
    </div>
  );
}

function AdminComposer({ me, onPublished, canUseOfficial = true }) {
  const isCommOnly = !me?.is_admin && !!me?.can_manage_communication;
  // Post as MS Park when admin mode is ON (canUseOfficial), else as the user.
  // No toggle is shown — the identity follows the top-right Admin switch.
  const showOfficialToggle = false;
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("Direction");
  const [images, setImages] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [links, setLinks] = useState([]);
  const [linkDraft, setLinkDraft] = useState("");
  const [postedAs, setPostedAs] = useState(canUseOfficial || isCommOnly ? "official" : "personal");
  const [audienceTargets, setAudienceTargets] = useState([]); // empty = all
  // Follow the admin toggle live: ON → publish as MS Park, OFF → personal.
  useEffect(() => {
    setPostedAs(canUseOfficial || isCommOnly ? "official" : "personal");
  }, [canUseOfficial, isCommOnly]);
  const [publishing, setPublishing] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);
  const [showEmojis, setShowEmojis] = useState(false);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [publishAt, setPublishAt] = useState(""); // datetime-local value
  const [documentsLib, setDocumentsLib] = useState([]);
  const textareaRef = useRef(null);

  // Live-sync la liste des documents disponibles (page Documents)
  useEffect(() => {
    if (!showAttachments) return;
    api.get("/documents").then((r) => setDocumentsLib(r.data || []));
  }, [showAttachments]);

  const publish = async () => {
    if (!title.trim()) {
      toast.error("Un titre est requis pour votre publication");
      return;
    }
    // Strip HTML tags to check the content has real substance
    const plain = content.replace(/<[^>]+>/g, "").trim();
    if (!plain) {
      toast.error("Le contenu ne peut pas être vide");
      return;
    }
    setPublishing(true);
    try {
      // Convert local datetime input to ISO. Empty string = publish now.
      const publishIso = publishAt ? new Date(publishAt).toISOString() : null;
      await api.post("/posts", {
        title: title.trim(),
        content, // HTML from the rich-text editor
        category,
        images,
        attachments,
        links,
        posted_as: postedAs,
        publish_at: publishIso,
        audience_status_targets: audienceTargets,
      });
      toast.success(publishIso && new Date(publishIso) > new Date()
        ? "Publication programmée !"
        : "Publication mise en ligne !");
      setTitle("");
      setContent("");
      setImages([]);
      setAttachments([]);
      setLinks([]);
      setPublishAt("");
      setAudienceTargets([]);
      setShowGallery(false);
      setShowAttachments(false);
      setShowLinkInput(false);
      setShowEmojis(false);
      setShowSchedule(false);
      setOpen(false);
      onPublished();
      notifyLiveRefresh(["posts", "news"]);
    } catch (err) {
      toast.error("Erreur de publication", { description: err.response?.data?.detail });
    } finally {
      setPublishing(false);
    }
  };

  const insertEmoji = (emoji) => {
    const t = textareaRef.current;
    if (!t) {
      setContent((c) => c + emoji);
      return;
    }
    const start = t.selectionStart;
    const end = t.selectionEnd;
    setContent((c) => c.slice(0, start) + emoji + c.slice(end));
    setTimeout(() => {
      t.focus();
      t.selectionStart = t.selectionEnd = start + emoji.length;
    }, 0);
  };

  const toggleImage = (url) => {
    setImages((imgs) => (imgs.includes(url) ? imgs.filter((x) => x !== url) : [...imgs, url]));
  };

  const toggleAttachment = (att) => {
    setAttachments((a) =>
      a.find((x) => x.url === att.url && x.name === att.name)
        ? a.filter((x) => !(x.url === att.url && x.name === att.name))
        : [...a, att]
    );
  };

  const addLink = () => {
    if (!linkDraft.trim()) return;
    let url = linkDraft.trim();
    if (!url.startsWith("http")) url = "https://" + url;
    setLinks((l) => [...l, url]);
    setLinkDraft("");
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        data-testid="open-composer"
        className="ms-card w-full p-4 flex items-center gap-3 hover:shadow-md transition-shadow text-left"
      >
        <img
          src={canUseOfficial || isCommOnly ? OFFICIAL_AVATAR : me.avatar}
          alt=""
          className={`h-10 w-10 rounded-full shrink-0 ${
            canUseOfficial || isCommOnly
              ? "object-contain bg-[#071B34] p-1 ring-2 ring-[#071B34]"
              : "object-cover ring-2 ring-[#3BA4FF]/40"
          }`}
        />
        <span className="text-sm text-[#475569] flex-1">
          {canUseOfficial || isCommOnly ? (
            <>
              Quoi de neuf, <strong className="text-[#071B34]">MS Park</strong> ? Publiez sur le fil…
            </>
          ) : (
            <>
              Quoi de neuf, <strong className="text-[#071B34]">{me.first_name}</strong> ? Publiez sur le fil MS Park…
            </>
          )}
        </span>
        <span className={`ms-chip ${isCommOnly ? "bg-[#F59E0B]/15 text-[#B45309]" : !canUseOfficial ? "bg-[#3BA4FF]/15 text-[#1D70B8]" : "bg-[#A78BFA]/15 text-[#7C3AED]"}`}>
          <Sparkles className="h-3 w-3" /> {isCommOnly ? "Communication" : !canUseOfficial ? "Personnel" : "Admin"}
        </span>
      </button>
    );
  }

  const authorAvatar = postedAs === "official" ? OFFICIAL_AVATAR : me.avatar;
  const authorName = postedAs === "official" ? "MS Park" : `${me.first_name} ${me.last_name}`;
  const authorRole = postedAs === "official"
    ? "Communication officielle"
    : me.role;

  return (
    <div className="ms-card p-5 space-y-3" data-testid="admin-composer">
      {/* Header + author selector */}
      <div className="flex items-start gap-3">
        <img
          src={authorAvatar}
          alt=""
          className={`h-11 w-11 rounded-full shrink-0 ${
            postedAs === "official" ? "object-contain bg-[#071B34] p-1" : "object-cover"
          }`}
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-[#071B34]">{authorName}</div>
          <div className="text-xs text-[#475569]">{authorRole}</div>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[#071B34]/5"
        >
          <X className="h-4 w-4 text-[#475569]" />
        </button>
      </div>

      {/* Publier en tant que — masqué pour les comm editors (toujours au nom MS Park) */}
      {showOfficialToggle && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[#475569] font-semibold mb-1.5">
            Publier en tant que
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setPostedAs("personal")}
              data-testid="posted-as-personal"
              className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold border transition-all ${
                postedAs === "personal"
                  ? "bg-[#3BA4FF]/10 border-[#3BA4FF] text-[#1D70B8]"
                  : "bg-white border-[#071B34]/10 text-[#475569] hover:border-[#3BA4FF]/40"
              }`}
            >
              <UserIcon className="h-3.5 w-3.5" />
              <span className="truncate">Mon compte ({me.first_name})</span>
            </button>
            <button
              onClick={() => setPostedAs("official")}
              data-testid="posted-as-official"
              className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold border transition-all ${
                postedAs === "official"
                  ? "bg-[#071B34] border-[#071B34] text-white"
                  : "bg-white border-[#071B34]/10 text-[#475569] hover:border-[#071B34]/40"
              }`}
            >
              <Building2 className="h-3.5 w-3.5" />
              MS Park (officiel)
            </button>
          </div>
        </div>
      )}
      {!isCommOnly && !canUseOfficial && (
        <div className="rounded-xl bg-[#3BA4FF]/10 border border-[#3BA4FF]/20 px-3 py-2 text-xs text-[#334155] flex items-center gap-2">
          <UserIcon className="h-3.5 w-3.5 text-[#1D70B8]" />
          Publication à votre nom personnel. Activez le mode <strong>Admin</strong> pour publier au nom de MS Park.
        </div>
      )}
      {isCommOnly && (
        <div className="rounded-xl bg-[#071B34]/5 border border-[#071B34]/10 px-3 py-2 text-xs text-[#475569] flex items-center gap-2">
          <Building2 className="h-3.5 w-3.5 text-[#071B34]" />
          Publication au nom officiel de <strong className="text-[#071B34]">MS Park</strong>.
        </div>
      )}

      <div>
        <label className="text-[10px] uppercase tracking-wider text-[#475569] font-semibold mb-1.5 block">
          Catégorie
        </label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          data-testid="composer-category"
          className="text-sm rounded-lg bg-[#F4F7FA] px-3 py-2 border-0 outline-none w-full"
        >
          {["Direction", "RH", "Événement", "Restauration", "annonce"].map((c) => (
            <option key={c} value={c}>
              {c === "annonce" ? "Annonce générale" : c}
            </option>
          ))}
        </select>
      </div>

      <AudiencePicker value={audienceTargets} onChange={setAudienceTargets} />

      <div>
        <label className="text-[10px] uppercase tracking-wider text-[#475569] font-semibold mb-1.5 block">
          Titre <span className="text-[#EF4444]">*</span>
        </label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={140}
          placeholder="Ex. Séminaire MS Park 2026"
          data-testid="composer-title"
          className="ms-input w-full text-[15px] font-semibold"
        />
        <div className="mt-1 text-[10px] text-[#475569] text-right">{title.length}/140</div>
      </div>

      <RichTextEditor
        value={content}
        onChange={setContent}
        placeholder="Partagez une actualité, un événement ou une note de service…"
        testId="composer-content"
      />

      {/* Preview images */}
      {images.length > 0 && (
        <div>
          <div className={`grid gap-2 ${images.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
            {images.map((url) => (
              <div key={url} className="relative rounded-xl overflow-hidden">
                <img src={url} alt="" className="w-full h-32 object-cover" />
                <button
                  onClick={() => toggleImage(url)}
                  className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Preview attachments */}
      {attachments.length > 0 && (
        <div className="space-y-1.5">
          {attachments.map((a, i) => (
            <div
              key={`${a.url}-${i}`}
              className="flex items-center gap-2 rounded-lg bg-[#F4F7FA] px-3 py-2"
            >
              <FileText className="h-4 w-4 text-[#3BA4FF] shrink-0" />
              <div className="flex-1 text-xs font-medium text-[#071B34] truncate">{a.name}</div>
              <button
                onClick={() => toggleAttachment(a)}
                className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-[#071B34]/5"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Preview links */}
      {links.length > 0 && (
        <div className="space-y-1">
          {links.map((l, i) => (
            <div
              key={l + i}
              className="flex items-center gap-2 rounded-lg bg-[#3BA4FF]/10 px-3 py-1.5"
            >
              <Link2 className="h-3.5 w-3.5 text-[#3BA4FF] shrink-0" />
              <div className="flex-1 text-xs text-[#1D70B8] truncate">{l}</div>
              <button
                onClick={() => setLinks((ls) => ls.filter((_, idx) => idx !== i))}
                className="flex h-5 w-5 items-center justify-center rounded-md hover:bg-white/50"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Gallery — upload from device + curated MS Park gallery */}
      {showGallery && (
        <div className="rounded-xl bg-[#F8FAFC] p-3 space-y-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[#475569] font-semibold mb-2">
              📱 Importer depuis votre galerie / pellicule ({images.length})
            </div>
            <ImageUpload
              value={images}
              onChange={setImages}
              mode="multi"
              testId="composer-image"
            />
          </div>
          <div className="pt-3 border-t border-[#071B34]/5">
            <div className="text-[10px] uppercase tracking-wider text-[#475569] font-semibold mb-2">
              🎨 …ou choisir dans la galerie MS Park
            </div>
            <div className="grid grid-cols-4 gap-2">
              {IMAGE_GALLERY.map((url) => {
                const sel = images.includes(url);
                return (
                  <button
                    key={url}
                    onClick={() => toggleImage(url)}
                    data-testid={`gallery-${url.slice(-30, -10)}`}
                    className={`aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                      sel ? "border-[#3BA4FF] scale-95" : "border-transparent hover:border-[#3BA4FF]/40"
                    }`}
                  >
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Attachments library */}
      {showAttachments && (
        <div className="rounded-xl bg-[#F8FAFC] p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] uppercase tracking-wider text-[#475569] font-semibold">
              Documents disponibles ({documentsLib.length}) — {attachments.length} joint{attachments.length > 1 ? "s" : ""}
            </div>
            <button
              type="button"
              onClick={() => api.get("/documents").then((r) => setDocumentsLib(r.data || []))}
              className="text-[10px] font-semibold text-[#3BA4FF] hover:underline"
              data-testid="attachments-refresh"
            >
              Rafraîchir
            </button>
          </div>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {documentsLib.length === 0 && (
              <div className="text-xs text-[#475569] italic px-2 py-3 text-center">
                Aucun document disponible pour votre profil.
              </div>
            )}
            {documentsLib.map((d) => {
              const name = d.title || d.name || "Document";
              const url = d.file_url || d.url || (d.id ? `/documents/${d.id}/download` : "#");
              const type = (d.file_type || (name.split(".").pop() || "PDF")).toUpperCase().slice(0, 4);
              const sel = attachments.find((x) => x.url === url && x.name === name);
              return (
                <button
                  key={d.id}
                  onClick={() => toggleAttachment({ name, url, type: type.toLowerCase() })}
                  data-testid={`doc-lib-${d.id}`}
                  className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
                    sel ? "bg-[#3BA4FF]/15" : "bg-white hover:bg-[#F4F7FA]"
                  }`}
                >
                  <FileText className="h-4 w-4 text-[#3BA4FF] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-[#071B34] truncate">{name}</div>
                    {d.category && (
                      <div className="text-[10px] text-[#475569] truncate">{d.category}</div>
                    )}
                  </div>
                  <span className="text-[9px] uppercase font-bold text-[#475569] shrink-0">{type}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Emojis */}
      {showEmojis && (
        <div className="rounded-xl bg-[#F8FAFC] p-3">
          <div className="text-[10px] uppercase tracking-wider text-[#475569] font-semibold mb-2">
            Emojis
          </div>
          <div className="grid grid-cols-12 gap-1">
            {EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => insertEmoji(e)}
                className="text-lg hover:bg-white rounded-md p-1 transition-colors"
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Link input */}
      {showLinkInput && (
        <div className="flex gap-2">
          <input
            value={linkDraft}
            onChange={(e) => setLinkDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addLink())}
            placeholder="https://exemple.com"
            className="ms-input flex-1 text-sm"
          />
          <button onClick={addLink} className="ms-btn-primary !px-4">
            <Link2 className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Schedule input */}
      {showSchedule && (
        <div className="rounded-xl bg-[#F8FAFC] p-3">
          <div className="text-[10px] uppercase tracking-wider text-[#475569] font-semibold mb-2">
            Programmer la publication
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="datetime-local"
              value={publishAt}
              onChange={(e) => setPublishAt(e.target.value)}
              data-testid="composer-publish-at"
              className="ms-input text-sm flex-1 min-w-[220px]"
            />
            {publishAt && (
              <button
                type="button"
                onClick={() => setPublishAt("")}
                className="text-xs font-semibold text-[#475569] hover:text-[#EF4444]"
              >
                Effacer
              </button>
            )}
          </div>
          <p className="text-[11px] text-[#475569] mt-1.5">
            Laissez vide pour publier immédiatement. Sinon, la publication apparaîtra automatiquement à la date & heure exactes.
          </p>
        </div>
      )}

      {/* Actions bar */}
      <div className="flex items-center justify-between gap-2 border-t border-[#071B34]/5 pt-3">
        <div className="flex items-center gap-1">
          <ToolBtn active={showGallery} onClick={() => setShowGallery((s) => !s)} testid="tool-photo">
            <ImageIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Photos</span>
          </ToolBtn>
          <ToolBtn active={showAttachments} onClick={() => setShowAttachments((s) => !s)} testid="tool-attach">
            <Paperclip className="h-4 w-4" />
            <span className="hidden sm:inline">Documents</span>
          </ToolBtn>
          <ToolBtn active={showEmojis} onClick={() => setShowEmojis((s) => !s)} testid="tool-emoji">
            <Smile className="h-4 w-4" />
            <span className="hidden sm:inline">Emoji</span>
          </ToolBtn>
          <ToolBtn active={showLinkInput} onClick={() => setShowLinkInput((s) => !s)} testid="tool-link">
            <Link2 className="h-4 w-4" />
            <span className="hidden sm:inline">Lien</span>
          </ToolBtn>
          <ToolBtn active={showSchedule || !!publishAt} onClick={() => setShowSchedule((s) => !s)} testid="tool-schedule">
            <Clock className="h-4 w-4" />
            <span className="hidden sm:inline">{publishAt ? "Programmée" : "Programmer"}</span>
          </ToolBtn>
        </div>
        <button
          onClick={publish}
          disabled={!content.trim() || publishing}
          data-testid="publish-post"
          className="ms-btn-primary disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
          {publishing
            ? "Publication…"
            : publishAt && new Date(publishAt) > new Date()
            ? "Programmer"
            : "Publier"}
        </button>
      </div>
    </div>
  );
}

function ToolBtn({ active, onClick, testid, children }) {
  return (
    <button
      onClick={onClick}
      data-testid={testid}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
        active
          ? "bg-[#3BA4FF]/15 text-[#1D70B8]"
          : "text-[#475569] hover:bg-[#071B34]/5"
      }`}
    >
      {children}
    </button>
  );
}

// ────────────────────── Post card

function PostCard({ post, me, onLike, findEmployee, refresh, setEditingPost, setLightbox, canModerate = true, autoOpenComments = false, pulseHighlight = false }) {
  const authorFromDb = findEmployee(post.author_id);
  const isOfficial = post.posted_as === "official";
  const author = isOfficial
    ? {
        first_name: "MS",
        last_name: "Park",
        role: "Communication officielle",
        avatar: OFFICIAL_AVATAR,
      }
    : authorFromDb || {
        first_name: "Inconnu",
        last_name: "",
        role: "",
        avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200",
      };
  const liked = me ? post.likes.includes(me.id) : false;
  const [showComments, setShowComments] = useState(autoOpenComments);
  const [commentDraft, setCommentDraft] = useState("");
  const [contentExpanded, setContentExpanded] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null); // parent comment id
  const [replyDraft, setReplyDraft] = useState("");

  useEffect(() => {
    if (autoOpenComments) setShowComments(true);
  }, [autoOpenComments]);

  // Heuristic: if the plain-text version is long enough, we display a truncated
  // block with "En voir plus" like Facebook/LinkedIn.
  const plainLen = (post.content || "").replace(/<[^>]+>/g, "").length;
  const canTruncate = plainLen > 220;

  const images = post.images?.length ? post.images : post.image ? [post.image] : [];

  const sendComment = async (e) => {
    e.preventDefault();
    if (!commentDraft.trim()) return;
    await api.post(`/posts/${post.id}/comments`, { content: commentDraft });
    setCommentDraft("");
    refresh();
  };

  const sendReply = async (parentId) => {
    if (!replyDraft.trim()) return;
    await api.post(`/posts/${post.id}/comments`, { content: replyDraft, parent_id: parentId });
    setReplyDraft("");
    setReplyingTo(null);
    refresh();
  };

  const toggleCommentLike = async (commentId) => {
    await api.post(`/posts/${post.id}/comments/${commentId}/like`);
    refresh();
  };

  return (
    <article
      className={`ms-card overflow-hidden transition-shadow duration-500 ${pulseHighlight ? "ring-4 ring-[#3BA4FF]/60 shadow-2xl" : ""}`}
      data-testid={`post-${post.id}`}
    >
      <div className="p-5">
        <div className="flex items-start gap-3">
          <div className="relative shrink-0">
            <img
              src={author.avatar}
              alt=""
              className={`h-11 w-11 rounded-full ${
                isOfficial
                  ? "object-contain bg-[#071B34] p-1 ring-2 ring-[#071B34]"
                  : "object-cover ring-2 ring-white shadow-sm"
              }`}
            />
            {isOfficial && (
              <span
                className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#071B34] ring-2 ring-white"
                title="Compte officiel"
              >
                <Building2 className="h-3 w-3 text-white" />
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-[#071B34]">
                {isOfficial ? "MS Park" : `${author.first_name} ${author.last_name}`}
              </span>
              <span className={`ms-chip ${categoryColor[post.category] || categoryColor.annonce}`}>
                {post.category}
              </span>
            </div>
            <div className="text-xs text-[#475569]">
              {author.role} · {formatDateFr(post.created_at.slice(0, 10))}
              {post.edited_at && <span className="italic"> · modifiée</span>}
              {post.is_scheduled && post.publish_at && (
                <span className="ml-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-widest bg-[#F59E0B]/15 text-[#B45309] px-2 py-0.5 rounded-full font-bold">
                  <Clock className="h-3 w-3" /> Programmée · {new Date(post.publish_at).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </div>
          </div>
          {((post.author_id === me?.id && post.posted_as !== "official") || ((me?.is_admin || me?.can_manage_communication) && canModerate && post.posted_as === "official")) && (
            <button
              onClick={() => setEditingPost(post)}
              data-testid={`edit-post-${post.id}`}
              className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[#3BA4FF]/10 text-[#3BA4FF]"
              title="Modifier"
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
          {(post.author_id === me?.id || ((me?.is_admin || me?.can_manage_communication) && canModerate)) && (
            <button
              onClick={async () => {
                if (!window.confirm("Supprimer cette publication ?")) return;
                await api.delete(`/posts/${post.id}`);
                toast.success("Publication supprimée");
                refresh();
                notifyLiveRefresh(["posts"]);
              }}
              data-testid={`delete-post-${post.id}`}
              className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[#FEE2E2] text-[#EF4444]"
              title="Supprimer"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>

        {post.title && (
          <Link
            to={`/actualites/${post.id}`}
            data-testid={`post-title-${post.id}`}
            className="mt-3 block text-lg font-bold text-[#071B34] hover:text-[#3BA4FF] transition-colors leading-snug"
          >
            {post.title}
          </Link>
        )}

        {post.content && (
          <>
            <div
              className={`mt-2 ms-prose text-[15px] leading-relaxed text-[#071B34] break-words ${
                canTruncate && !contentExpanded ? "line-clamp-3 overflow-hidden" : ""
              }`}
              data-testid={`post-content-${post.id}`}
              dangerouslySetInnerHTML={{ __html: post.content }}
            />
            {canTruncate && (
              <button
                onClick={() => setContentExpanded((v) => !v)}
                data-testid={`post-expand-${post.id}`}
                className="mt-1 text-xs font-semibold text-[#3BA4FF] hover:text-[#1D70B8]"
              >
                {contentExpanded ? "Réduire" : "En voir plus"}
              </button>
            )}
          </>
        )}

        {post.hashtags?.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {post.hashtags.map((h) => (
              <span key={h} className="text-xs font-semibold text-[#3BA4FF]">
                {h}
              </span>
            ))}
          </div>
        )}

        {post.links?.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {post.links.map((l, i) => (
              <a
                key={l + i}
                href={l}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-lg bg-[#3BA4FF]/10 hover:bg-[#3BA4FF]/20 px-3 py-2 text-sm text-[#1D70B8] truncate transition-colors"
              >
                <Link2 className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{l}</span>
              </a>
            ))}
          </div>
        )}

        {post.attachments?.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {post.attachments.map((a, i) => (
              <a
                key={`${a.url}-${i}`}
                href={a.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-lg bg-[#F4F7FA] hover:bg-[#071B34]/5 px-3 py-2 text-sm text-[#071B34] transition-colors"
              >
                <FileText className="h-4 w-4 text-[#3BA4FF] shrink-0" />
                <span className="flex-1 font-medium truncate">{a.name}</span>
                <span className="text-[9px] uppercase font-bold text-[#475569]">{a.type}</span>
              </a>
            ))}
          </div>
        )}
      </div>

      {images.length > 0 && (
        <div className={`grid gap-1 ${images.length === 1 ? "grid-cols-1" : images.length === 2 ? "grid-cols-2" : "grid-cols-2"}`}>
          {images.slice(0, 4).map((url, i) => (
            <button
              key={url + i}
              type="button"
              onClick={() => setLightbox({ images, index: i })}
              data-testid={`post-image-${post.id}-${i}`}
              className={`relative overflow-hidden group ${images.length === 1 ? "" : ""}`}
              title="Voir en grand"
            >
              <img
                src={absoluteUrl(url)}
                alt=""
                className={`w-full object-cover transition-transform duration-500 group-hover:scale-[1.03] cursor-zoom-in ${
                  images.length === 1 ? "max-h-96" : "h-48"
                }`}
              />
              {i === 3 && images.length > 4 && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-2xl font-bold">
                  +{images.length - 4}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      <div className="px-5 py-3 border-t border-[#071B34]/5 flex items-center gap-4 text-xs text-[#475569]">
        <button
          onClick={onLike}
          data-testid={`like-${post.id}`}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-semibold transition-colors ${
            liked ? "text-[#EF4444]" : "hover:text-[#EF4444]"
          }`}
        >
          <Heart className={`h-4 w-4 ${liked ? "fill-current" : ""}`} />
          {post.likes.length}
        </button>
        <button
          onClick={() => setShowComments((s) => !s)}
          data-testid={`comments-${post.id}`}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-semibold hover:text-[#3BA4FF] transition-colors"
        >
          {showComments ? <EyeOff className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
          {post.comments.length}
        </button>
      </div>

      {showComments && (
        <div className="px-5 pb-5 space-y-3">
          {post.comments.map((c) => {
            const ca = findEmployee(c.author_id) || { first_name: "?", avatar: "" };
            const cLikes = c.likes || [];
            const cLiked = me ? cLikes.includes(me.id) : false;
            return (
              <div key={c.id} className="space-y-2">
                <div className="flex items-start gap-3">
                  <img src={ca.avatar} alt="" className="h-8 w-8 rounded-full object-cover shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="rounded-2xl bg-[#F4F7FA] px-4 py-2">
                      <div className="text-xs font-semibold text-[#071B34]">
                        {ca.first_name} {ca.last_name}
                      </div>
                      <div className="text-sm text-[#071B34] whitespace-pre-wrap break-words">{c.content}</div>
                    </div>
                    <div className="flex items-center gap-3 mt-1 pl-2 text-[11px] font-semibold text-[#475569]">
                      <button
                        onClick={() => toggleCommentLike(c.id)}
                        data-testid={`comment-like-${c.id}`}
                        className={`inline-flex items-center gap-1 hover:text-[#EF4444] transition-colors ${cLiked ? "text-[#EF4444]" : ""}`}
                      >
                        <Heart className={`h-3.5 w-3.5 ${cLiked ? "fill-current" : ""}`} />
                        {cLikes.length > 0 && <span>{cLikes.length}</span>}
                        <span>{cLiked ? "Aimé" : "J'aime"}</span>
                      </button>
                      <button
                        onClick={() => { setReplyingTo(replyingTo === c.id ? null : c.id); setReplyDraft(""); }}
                        data-testid={`comment-reply-${c.id}`}
                        className="hover:text-[#3BA4FF] transition-colors"
                      >
                        Répondre
                      </button>
                    </div>
                    {/* Replies */}
                    {(c.replies || []).length > 0 && (
                      <div className="mt-2 space-y-2 pl-3 border-l-2 border-[#071B34]/5">
                        {c.replies.map((r) => {
                          const ra = findEmployee(r.author_id) || { first_name: "?", avatar: "" };
                          const rLikes = r.likes || [];
                          const rLiked = me ? rLikes.includes(me.id) : false;
                          return (
                            <div key={r.id} className="flex items-start gap-2">
                              <img src={ra.avatar} alt="" className="h-7 w-7 rounded-full object-cover shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="rounded-2xl bg-[#F4F7FA] px-3.5 py-1.5">
                                  <div className="text-[11px] font-semibold text-[#071B34]">
                                    {ra.first_name} {ra.last_name}
                                  </div>
                                  <div className="text-sm text-[#071B34] whitespace-pre-wrap break-words">{r.content}</div>
                                </div>
                                <div className="mt-0.5 pl-2">
                                  <button
                                    onClick={() => toggleCommentLike(r.id)}
                                    data-testid={`reply-like-${r.id}`}
                                    className={`inline-flex items-center gap-1 text-[11px] font-semibold hover:text-[#EF4444] transition-colors ${rLiked ? "text-[#EF4444]" : "text-[#475569]"}`}
                                  >
                                    <Heart className={`h-3 w-3 ${rLiked ? "fill-current" : ""}`} />
                                    {rLikes.length > 0 && <span>{rLikes.length}</span>}
                                    <span>{rLiked ? "Aimé" : "J'aime"}</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {/* Reply composer */}
                    {replyingTo === c.id && me && (
                      <form
                        onSubmit={(e) => { e.preventDefault(); sendReply(c.id); }}
                        className="mt-2 flex items-center gap-2"
                      >
                        <img src={me.avatar} alt="" className="h-7 w-7 rounded-full object-cover shrink-0" />
                        <input
                          value={replyDraft}
                          onChange={(e) => setReplyDraft(e.target.value)}
                          autoFocus
                          placeholder={`Répondre à ${ca.first_name}…`}
                          data-testid={`reply-input-${c.id}`}
                          className="ms-input flex-1 text-sm"
                        />
                        <button
                          type="submit"
                          data-testid={`reply-send-${c.id}`}
                          className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#3BA4FF] text-white hover:bg-[#2A8DE0]"
                        >
                          <Send className="h-3 w-3" />
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {me && (
            <form onSubmit={sendComment} className="flex items-center gap-2 pt-1">
              <img src={me.avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
              <input
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                placeholder="Ajouter un commentaire…"
                data-testid={`comment-input-${post.id}`}
                className="ms-input flex-1 text-sm"
              />
              <button
                type="submit"
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#3BA4FF] text-white hover:bg-[#2A8DE0]"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </form>
          )}
        </div>
      )}
    </article>
  );
}


// ────────────────────── Edit post modal (author edits their own publication)
function PostEditor({ post, onClose, onSaved }) {
  const [title, setTitle] = useState(post.title || "");
  const [content, setContent] = useState(post.content || "");
  const [images, setImages] = useState(post.images || []);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim()) {
      toast.error("Un titre est requis");
      return;
    }
    setSaving(true);
    try {
      await api.put(`/posts/${post.id}`, {
        title: title.trim(),
        content,
        images,
      });
      toast.success("Publication mise à jour");
      onSaved();
    } catch (err) {
      toast.error("Erreur", { description: err.response?.data?.detail });
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-md flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        data-testid="post-editor"
        className="ms-card w-full max-w-2xl max-h-[92vh] overflow-y-auto p-6"
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="ms-overline">Modifier</div>
            <h3 className="text-xl font-bold text-[#071B34] mt-1">Édition de votre publication</h3>
          </div>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[#071B34]/5">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-[#475569] font-semibold">Titre</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={140}
              data-testid="post-edit-title"
              className="ms-input mt-1 font-semibold"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-[#475569] font-semibold">Contenu</label>
            <RichTextEditor value={content} onChange={setContent} testId="post-edit-content" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-[#475569] font-semibold">Images</label>
            <ImageUpload value={images} onChange={setImages} mode="multi" testId="post-edit-image" />
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="ms-btn-outline flex-1">Annuler</button>
            <button
              onClick={save}
              disabled={saving}
              data-testid="post-edit-save"
              className="ms-btn-primary flex-1 disabled:opacity-50"
            >
              {saving ? "Enregistrement…" : "Enregistrer les modifications"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}



// ────────────────────── Lightbox
function Lightbox({ images, startIndex = 0, onClose }) {
  const [idx, setIdx] = useState(startIndex);
  const total = images.length;

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setIdx((i) => (i + 1) % total);
      if (e.key === "ArrowLeft") setIdx((i) => (i - 1 + total) % total);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [total, onClose]);

  const prev = (e) => { e.stopPropagation(); setIdx((i) => (i - 1 + total) % total); };
  const next = (e) => { e.stopPropagation(); setIdx((i) => (i + 1) % total); };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      data-testid="lightbox"
      onClick={onClose}
      className="fixed inset-0 z-[110] bg-black/90 backdrop-blur-md flex items-center justify-center"
    >
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        data-testid="lightbox-close"
        className="absolute top-4 right-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
        aria-label="Fermer"
      >
        <X className="h-5 w-5" />
      </button>

      {total > 1 && (
        <>
          <button
            onClick={prev}
            data-testid="lightbox-prev"
            className="absolute left-4 top-1/2 -translate-y-1/2 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
            aria-label="Précédent"
          >
            ‹
          </button>
          <button
            onClick={next}
            data-testid="lightbox-next"
            className="absolute right-4 top-1/2 -translate-y-1/2 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
            aria-label="Suivant"
          >
            ›
          </button>
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/80 text-xs font-semibold bg-white/10 rounded-full px-3 py-1">
            {idx + 1} / {total}
          </div>
        </>
      )}

      <img
        src={absoluteUrl(images[idx])}
        alt=""
        onClick={(e) => e.stopPropagation()}
        data-testid="lightbox-image"
        className="max-w-[92vw] max-h-[88vh] object-contain rounded-lg shadow-2xl"
      />
    </div>,
    document.body
  );
}
