import { useEffect, useMemo, useState } from "react";
import { Heart, MessageCircle, Send, Filter, Eye, EyeOff } from "lucide-react";
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
