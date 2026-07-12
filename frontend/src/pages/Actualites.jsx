import { useEffect, useMemo, useState } from "react";
import { Heart, MessageCircle, Send, Filter, Eye, EyeOff, Image as ImageIcon, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { api, formatDateFr } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";

const FILTERS = [
  { k: "all", l: "Toutes", color: "#475569" },
  { k: "Direction", l: "Direction", color: "#3BA4FF" },
  { k: "RH", l: "RH", color: "#10B981" },
  { k: "Événement", l: "Événements", color: "#A78BFA" },
  { k: "Restauration", l: "Restauration", color: "#F59E0B" },
];

const categoryColor = {
  Direction: "bg-[#3BA4FF]/15 text-[#1D70B8]",
  Restauration: "bg-[#F59E0B]/15 text-[#B45309]",
  Événement: "bg-[#A78BFA]/15 text-[#7C3AED]",
  RH: "bg-[#10B981]/15 text-[#065F46]",
  annonce: "bg-[#64748B]/15 text-[#475569]",
};

// Galerie d'images MS Park pré-sélectionnées
const IMAGE_GALLERY = [
  "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=1200",
  "https://images.unsplash.com/photo-1522860747422-1b3b0e7527ff?w=1200",
  "https://images.unsplash.com/photo-1543083477-4f785aeafaa9?w=1200",
  "https://images.unsplash.com/photo-1571167530149-c72f2a45f57d?w=1200",
  "https://images.unsplash.com/photo-1594736797933-d0501ba2fe65?w=1200",
  "https://images.unsplash.com/photo-1517649763962-0c623066013b?w=1200",
  "https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?w=1200",
  "https://images.unsplash.com/photo-1526397751294-331021109fbd?w=1200",
];

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

  const filtered = useMemo(() => {
    if (filter === "all") return posts;
    return posts.filter((p) => p.category === filter);
  }, [posts, filter]);

  return (
    <div className="space-y-6 ms-fade-up max-w-3xl mx-auto">
      <div>
        <div className="ms-overline">Actualités entreprise</div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[#071B34] mt-1">
          Le fil de MS Park
        </h1>
        <p className="text-sm text-[#475569] mt-2">
          Annonces, événements et communication officielle. Consultation uniquement.
        </p>
      </div>

      {/* Filters */}
      <div className="ms-card p-4 flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-[#475569] mr-1" />
        {FILTERS.map((f) => (
          <button
            key={f.k}
            onClick={() => setFilter(f.k)}
            data-testid={`filter-${f.k}`}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
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
            Aucune actualité dans cette catégorie.
          </div>
        )}
        {filtered.map((p) => (
          <PostCard key={p.id} post={p} me={me} onLike={() => like(p.id)} findEmployee={findEmployee} refresh={refresh} />
        ))}
      </div>
    </div>
  );
}

function AdminComposer({ me, onPublished }) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("Direction");
  const [image, setImage] = useState(null);
  const [showGallery, setShowGallery] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const publish = async () => {
    if (!content.trim()) return;
    setPublishing(true);
    try {
      await api.post("/posts", { content: content.trim(), category, image });
      toast.success("Publication mise en ligne !");
      setContent("");
      setImage(null);
      setOpen(false);
      onPublished();
    } catch (err) {
      toast.error("Erreur de publication", { description: err.response?.data?.detail });
    } finally {
      setPublishing(false);
    }
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
        <span className="ms-chip bg-[#A78BFA]/15 text-[#7C3AED]">
          <Sparkles className="h-3 w-3" /> Admin
        </span>
      </button>
    );
  }

  return (
    <div className="ms-card p-5 space-y-3" data-testid="admin-composer">
      <div className="flex items-start gap-3">
        <img src={me.avatar} alt="" className="h-10 w-10 rounded-full object-cover shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-[#071B34]">
            {me.first_name} {me.last_name}
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            data-testid="composer-category"
            className="text-xs mt-1 rounded-full bg-[#F4F7FA] px-3 py-1 border-0 outline-none"
          >
            {["Direction", "RH", "Événement", "Restauration", "annonce"].map((c) => (
              <option key={c} value={c}>
                {c === "annonce" ? "Annonce" : c}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={() => {
            setOpen(false);
            setContent("");
            setImage(null);
          }}
          className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[#071B34]/5"
        >
          <X className="h-4 w-4 text-[#475569]" />
        </button>
      </div>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={4}
        autoFocus
        placeholder="Partagez une actualité, un événement ou une note de service…"
        data-testid="composer-content"
        className="ms-input w-full resize-none text-[15px]"
      />

      {image && (
        <div className="relative rounded-2xl overflow-hidden">
          <img src={image} alt="preview" className="w-full max-h-64 object-cover" />
          <button
            onClick={() => setImage(null)}
            className="absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {showGallery && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[#475569] font-semibold mb-2">
            Choisir une image (galerie MS Park)
          </div>
          <div className="grid grid-cols-4 gap-2">
            {IMAGE_GALLERY.map((url) => (
              <button
                key={url}
                onClick={() => {
                  setImage(url);
                  setShowGallery(false);
                }}
                data-testid={`gallery-${url.slice(-20)}`}
                className={`aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                  image === url ? "border-[#3BA4FF] scale-95" : "border-transparent hover:border-[#3BA4FF]/40"
                }`}
              >
                <img src={url} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-[#071B34]/5 pt-3">
        <button
          onClick={() => setShowGallery((s) => !s)}
          data-testid="toggle-gallery"
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-[#3BA4FF] hover:bg-[#3BA4FF]/10"
        >
          <ImageIcon className="h-4 w-4" />
          {showGallery ? "Fermer galerie" : "Ajouter une image"}
        </button>
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


function PostCard({ post, me, onLike, findEmployee, refresh }) {
  const author = findEmployee(post.author_id) || {
    first_name: "Inconnu",
    last_name: "",
    role: "",
    avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&h=200&fit=crop",
  };
  const liked = me ? post.likes.includes(me.id) : false;
  const [showComments, setShowComments] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");

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
          <img
            src={author.avatar}
            alt={author.first_name}
            className="h-11 w-11 rounded-full object-cover ring-2 ring-white shadow-sm"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-[#071B34]">
                {author.first_name} {author.last_name}
              </span>
              <span className={`ms-chip ${categoryColor[post.category] || categoryColor.annonce}`}>
                {post.category}
              </span>
            </div>
            <div className="text-xs text-[#475569]">
              {author.role} · {formatDateFr(post.created_at.slice(0, 10))}
            </div>
          </div>
          {me?.is_admin && (
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
        <p className="mt-3 text-[15px] leading-relaxed text-[#071B34] whitespace-pre-wrap">{post.content}</p>
        {post.hashtags?.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {post.hashtags.map((h) => (
              <span key={h} className="text-xs font-semibold text-[#3BA4FF]">
                {h}
              </span>
            ))}
          </div>
        )}
      </div>
      {post.image && <img src={post.image} alt="" className="w-full max-h-96 object-cover" />}
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
                <img src={ca.avatar} alt={ca.first_name} className="h-8 w-8 rounded-full object-cover" />
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
              <img src={me.avatar} alt="me" className="h-8 w-8 rounded-full object-cover" />
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
