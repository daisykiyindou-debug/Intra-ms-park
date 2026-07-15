import { useEffect, useMemo, useRef, useState } from "react";
import {
  Heart, MessageCircle, Send, Filter, Eye, EyeOff,
  Image as ImageIcon, Paperclip, Link2, Smile, Sparkles, Trash2, X,
  FileText, User as UserIcon, Building2, ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { api, formatDateFr } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";

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
  "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=200&h=200&fit=crop";

export default function Actualites() {
  const { me, findEmployee } = useApp();
  const [posts, setPosts] = useState([]);
  const [filter, setFilter] = useState("all");

  const refresh = () => api.get("/posts").then((r) => setPosts(r.data));
  useEffect(() => { refresh(); }, []);

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
          {me?.is_admin
            ? "Publiez des annonces, photos, documents pour toute l'équipe. Vous choisissez de poster en votre nom ou au nom de MS Park."
            : me?.can_manage_communication
            ? "Publiez, modifiez et supprimez les actualités officielles au nom de MS Park."
            : "Annonces, événements et communication officielle."}
        </p>
      </div>

      {(me?.is_admin || me?.can_manage_communication) && <AdminComposer me={me} onPublished={refresh} />}

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
          />
        ))}
      </div>
    </div>
  );
}

// ────────────────────── Composer

function AdminComposer({ me, onPublished }) {
  const isCommOnly = !me?.is_admin && !!me?.can_manage_communication;
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("Direction");
  const [images, setImages] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [links, setLinks] = useState([]);
  const [linkDraft, setLinkDraft] = useState("");
  const [postedAs, setPostedAs] = useState(isCommOnly ? "official" : "personal");
  const [publishing, setPublishing] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);
  const [showEmojis, setShowEmojis] = useState(false);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const textareaRef = useRef(null);

  const publish = async () => {
    if (!content.trim()) return;
    setPublishing(true);
    try {
      await api.post("/posts", {
        content: content.trim(),
        category,
        images,
        attachments,
        links,
        posted_as: postedAs,
      });
      toast.success("Publication mise en ligne !");
      setContent("");
      setImages([]);
      setAttachments([]);
      setLinks([]);
      setShowGallery(false);
      setShowAttachments(false);
      setShowLinkInput(false);
      setShowEmojis(false);
      setOpen(false);
      onPublished();
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
        <img src={me.avatar} alt="" className="h-10 w-10 rounded-full object-cover ring-2 ring-[#3BA4FF]/40" />
        <span className="text-sm text-[#475569] flex-1">
          Quoi de neuf, <strong className="text-[#071B34]">{me.first_name}</strong> ? Publiez sur le fil MS Park…
        </span>
        <span className={`ms-chip ${isCommOnly ? "bg-[#F59E0B]/15 text-[#B45309]" : "bg-[#A78BFA]/15 text-[#7C3AED]"}`}>
          <Sparkles className="h-3 w-3" /> {isCommOnly ? "Communication" : "Admin"}
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
        <img src={authorAvatar} alt="" className="h-11 w-11 rounded-full object-cover shrink-0" />
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
      {!isCommOnly && (
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

      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={4}
        autoFocus
        placeholder="Partagez une actualité, un événement ou une note de service…"
        data-testid="composer-content"
        className="ms-input w-full resize-none text-[15px]"
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

      {/* Gallery */}
      {showGallery && (
        <div className="rounded-xl bg-[#F8FAFC] p-3">
          <div className="text-[10px] uppercase tracking-wider text-[#475569] font-semibold mb-2">
            Galerie MS Park — {images.length} sélectionnée{images.length > 1 ? "s" : ""}
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
      )}

      {/* Attachments library */}
      {showAttachments && (
        <div className="rounded-xl bg-[#F8FAFC] p-3">
          <div className="text-[10px] uppercase tracking-wider text-[#475569] font-semibold mb-2">
            Documents ({attachments.length} joint{attachments.length > 1 ? "s" : ""})
          </div>
          <div className="space-y-1">
            {ATTACHMENTS_LIBRARY.map((a, i) => {
              const sel = attachments.find((x) => x.url === a.url && x.name === a.name);
              return (
                <button
                  key={i}
                  onClick={() => toggleAttachment(a)}
                  className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
                    sel ? "bg-[#3BA4FF]/15" : "bg-white hover:bg-[#F4F7FA]"
                  }`}
                >
                  <FileText className="h-4 w-4 text-[#3BA4FF] shrink-0" />
                  <div className="flex-1 text-xs font-medium text-[#071B34] truncate">{a.name}</div>
                  <span className="text-[9px] uppercase font-bold text-[#475569]">{a.type}</span>
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
        </div>
        <button
          onClick={publish}
          disabled={!content.trim() || publishing}
          data-testid="publish-post"
          className="ms-btn-primary disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
          {publishing ? "Publication…" : "Publier"}
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

function PostCard({ post, me, onLike, findEmployee, refresh }) {
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
  const [showComments, setShowComments] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");

  const images = post.images?.length ? post.images : post.image ? [post.image] : [];

  const sendComment = async (e) => {
    e.preventDefault();
    if (!commentDraft.trim()) return;
    await api.post(`/posts/${post.id}/comments`, { content: commentDraft });
    setCommentDraft("");
    refresh();
  };

  return (
    <article className="ms-card overflow-hidden" data-testid={`post-${post.id}`}>
      <div className="p-5">
        <div className="flex items-start gap-3">
          <div className="relative shrink-0">
            <img
              src={author.avatar}
              alt=""
              className={`h-11 w-11 rounded-full object-cover ${
                isOfficial ? "ring-2 ring-[#071B34]" : "ring-2 ring-white shadow-sm"
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
            </div>
          </div>
          {(me?.is_admin || me?.can_manage_communication) && (
            <button
              onClick={async () => {
                if (!window.confirm("Supprimer cette publication ?")) return;
                await api.delete(`/posts/${post.id}`);
                toast.success("Publication supprimée");
                refresh();
              }}
              data-testid={`delete-post-${post.id}`}
              className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[#FEE2E2] text-[#EF4444]"
              title="Supprimer"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>

        {post.content && (
          <p className="mt-3 text-[15px] leading-relaxed text-[#071B34] whitespace-pre-wrap break-words">
            {post.content}
          </p>
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
            <img
              key={url + i}
              src={url}
              alt=""
              className={`w-full object-cover ${images.length === 1 ? "max-h-96" : "h-48"}`}
            />
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
            return (
              <div key={c.id} className="flex items-start gap-3">
                <img src={ca.avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
                <div className="flex-1 rounded-2xl bg-[#F4F7FA] px-4 py-2">
                  <div className="text-xs font-semibold text-[#071B34]">
                    {ca.first_name} {ca.last_name}
                  </div>
                  <div className="text-sm text-[#071B34]">{c.content}</div>
                </div>
              </div>
            );
          })}
          {me && (
            <form onSubmit={sendComment} className="flex items-center gap-2">
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
