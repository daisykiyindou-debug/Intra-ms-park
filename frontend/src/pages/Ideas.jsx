import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Lightbulb, Users, TrendingUp, Trophy, ChevronUp, ChevronRight, Search, MessageCircle,
  Sparkles, Clock as ClockIcon, CheckCircle2, XCircle, Shield, ThumbsUp, ThumbsDown, ArrowLeft,
  Send, Bell, Flag, Share2, UploadCloud, Target, Handshake, FileText, X, Plus, Save, Circle,
  Trash2, UserCog, ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import { api, absoluteUrl } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";
import PortalModal from "@/components/PortalModal";
import ImageUpload from "@/components/ImageUpload";

const CATEGORIES = [
  "Amélioration", "Événement", "Bien-être", "Technologie", "Environnement",
  "Équipements", "Restauration", "Événements", "Autres",
];

const STATUSES = [
  { id: "new", label: "En attente", cls: "bg-[#94A3B8]/15 text-[#475569]", icon: ClockIcon },
  { id: "reviewing", label: "En étude", cls: "bg-[#F59E0B]/15 text-[#B45309]", icon: Sparkles },
  { id: "accepted", label: "Validée", cls: "bg-[#10B981]/15 text-[#047857]", icon: CheckCircle2 },
  { id: "rejected", label: "Refusée", cls: "bg-[#EF4444]/15 text-[#B91C1C]", icon: XCircle },
  { id: "delivered", label: "Mise en place", cls: "bg-[#3BA4FF]/15 text-[#1D70B8]", icon: Target },
];

const statusMeta = (id) => STATUSES.find((s) => s.id === id) || STATUSES[0];

function formatDateFr(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

// ═══════════════════════════════════════════════════════════════════
// Page 1 : Liste des idées
// ═══════════════════════════════════════════════════════════════════
export default function IdeasList() {
  const navigate = useNavigate();
  const { me, adminMode } = useApp();
  const isAdmin = !!me?.is_admin && adminMode !== false;

  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({ total_ideas: 0, total_votes: 0, accepted: 0, reviewing: 0, rejected: 0, top_categories: [] });
  const [tab, setTab] = useState("all"); // all | mine | popular
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [catFilter, setCatFilter] = useState("all");
  const [anonOnly, setAnonOnly] = useState(false);
  const [sortBy, setSortBy] = useState("recent"); // recent | votes

  const load = async () => {
    const [{ data: list }, { data: st }] = await Promise.all([
      api.get("/ideas"),
      api.get("/ideas/stats"),
    ]);
    setItems(list);
    setStats(st);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let list = [...items];
    if (tab === "mine") list = list.filter((i) => i.me_is_author);
    if (tab === "popular") list = list.filter((i) => i.score > 0);
    if (statusFilter !== "all") list = list.filter((i) => i.status === statusFilter);
    if (catFilter !== "all") list = list.filter((i) => i.category === catFilter);
    if (anonOnly) list = list.filter((i) => i.is_anonymous);
    if (q.trim()) {
      const n = q.toLowerCase();
      list = list.filter((i) => `${i.title} ${i.description}`.toLowerCase().includes(n));
    }
    list.sort((a, b) => sortBy === "votes" ? b.score - a.score : b.created_at.localeCompare(a.created_at));
    return list;
  }, [items, tab, q, statusFilter, catFilter, anonOnly, sortBy]);

  return (
    <div className="space-y-5 ms-fade-up">
      <div>
        <div className="ms-overline">Vie de l&apos;entreprise › Boîte à idées</div>
        <div className="mt-1 flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-[#4338CA]/15 text-[#4338CA] flex items-center justify-center">
              <Lightbulb className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[#071B34]">Boîte à idées</h1>
              <p className="text-sm text-[#475569] mt-0.5">Partagez vos idées, votez pour celles de vos collègues.</p>
            </div>
          </div>
          <button
            onClick={() => navigate("/idees/nouveau")}
            data-testid="new-idea"
            className="rounded-xl bg-[#4338CA] hover:bg-[#3730A3] text-white font-semibold px-4 py-2.5 inline-flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="h-4 w-4" /> Proposer une idée
          </button>
        </div>
      </div>

      {/* Hero — 4 pillars */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <Pillar tone="#4338CA" icon={Lightbulb} title="Vos idées comptent" desc="Chaque idée peut améliorer notre quotidien" />
        <Pillar tone="#10B981" icon={Users} title="Anonyme ou non" desc="Proposez vos idées anonymement si vous le souhaitez" />
        <Pillar tone="#F59E0B" icon={TrendingUp} title="Suivi transparent" desc="Suivez l'avancement de chaque idée proposée" />
        <Pillar tone="#3BA4FF" icon={Handshake} title="Agissons ensemble" desc="Vos idées peuvent devenir nos prochaines actions" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start">
        <div className="space-y-4">
          {/* Tabs + filters */}
          <div className="ms-card p-4 space-y-3">
            <div className="border-b border-[#071B34]/5 flex items-center gap-5">
              {[
                { k: "all", l: "Toutes les idées" },
                { k: "mine", l: "Mes idées" },
                { k: "popular", l: "Populaires" },
              ].map((t) => (
                <button
                  key={t.k}
                  onClick={() => setTab(t.k)}
                  data-testid={`idea-tab-${t.k}`}
                  className={`relative py-2 text-sm font-semibold transition-colors ${
                    tab === t.k ? "text-[#4338CA]" : "text-[#475569] hover:text-[#071B34]"
                  }`}
                >
                  {t.l}
                  {tab === t.k && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-[#4338CA] rounded-t" />}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="ms-input max-w-[180px] text-sm !py-2">
                <option value="all">Tous les statuts</option>
                {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="ms-input max-w-[200px] text-sm !py-2">
                <option value="all">Toutes les catégories</option>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
              <button
                onClick={() => setAnonOnly((v) => !v)}
                data-testid="idea-anon-filter"
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ${
                  anonOnly ? "bg-[#4338CA]/15 text-[#4338CA] ring-1 ring-[#4338CA]/30" : "bg-[#F4F7FA] text-[#475569] hover:bg-[#071B34]/5"
                }`}
              >
                <Shield className="h-3.5 w-3.5" /> Idées anonymes
              </button>
              <div className="ml-auto flex items-center gap-1.5">
                <span className="text-xs text-[#475569]">Trier par :</span>
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="ms-input max-w-[150px] text-sm !py-2">
                  <option value="recent">Plus récentes</option>
                  <option value="votes">Plus votées</option>
                </select>
              </div>
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8]" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Rechercher…"
                  data-testid="idea-search"
                  className="ms-input pl-9 text-sm !py-2"
                />
              </div>
            </div>
          </div>

          {/* Cards */}
          {filtered.length === 0 && (
            <div className="ms-card p-10 text-center text-sm text-[#475569]">
              Aucune idée pour ces filtres. Soyez le premier à en proposer une !
            </div>
          )}
          <div className="space-y-3">
            {filtered.map((i) => <IdeaCard key={i.id} idea={i} isAdmin={isAdmin} onNavigate={() => navigate(`/idees/${i.id}`)} onChange={load} />)}
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-4 lg:sticky lg:top-24">
          <div className="ms-card p-4">
            <h3 className="text-sm font-bold text-[#071B34] mb-3">Comment ça fonctionne ?</h3>
            {[
              { n: 1, t: "Proposez votre idée", d: "Cliquez sur « Proposer une idée » et partagez votre suggestion." },
              { n: 2, t: "Votez pour vos favoris", d: "Soutenez les idées que vous appréciez en votant." },
              { n: 3, t: "Suivez l'avancement", d: "Restez informé de l'évolution des idées proposées." },
            ].map((s) => (
              <div key={s.n} className="flex gap-2 mt-3 first:mt-0">
                <div className="h-6 w-6 rounded-full bg-[#4338CA]/15 text-[#4338CA] flex items-center justify-center text-xs font-bold shrink-0">{s.n}</div>
                <div>
                  <div className="text-xs font-bold text-[#071B34]">{s.t}</div>
                  <div className="text-[11px] text-[#475569] mt-0.5">{s.d}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="ms-card p-4">
            <h3 className="text-sm font-bold text-[#071B34] mb-3">Statistiques</h3>
            <StatRow icon={FileText} tone="#4338CA" label="Idées proposées" value={stats.total_ideas} />
            <StatRow icon={ThumbsUp} tone="#10B981" label="Votes au total" value={stats.total_votes} />
            <StatRow icon={CheckCircle2} tone="#10B981" label="Idées validées" value={stats.accepted} />
            <StatRow icon={ClockIcon} tone="#F59E0B" label="En cours d'étude" value={stats.reviewing} />
            <StatRow icon={XCircle} tone="#EF4444" label="Idées refusées" value={stats.rejected} />
          </div>

          {stats.top_categories.length > 0 && (
            <div className="ms-card p-4">
              <h3 className="text-sm font-bold text-[#071B34] mb-3">Catégories populaires</h3>
              <div className="space-y-2">
                {stats.top_categories.map((c) => (
                  <div key={c.name} className="flex items-center justify-between text-sm">
                    <div className="inline-flex items-center gap-2 text-[#334155]">
                      <span className="h-2 w-2 rounded-full bg-[#4338CA]" />
                      {c.name}
                    </div>
                    <span className="text-xs text-[#475569] font-semibold">{c.count} idées</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Pillar({ tone, icon: Icon, title, desc }) {
  return (
    <div className="ms-card p-4 flex items-start gap-3">
      <div className="h-11 w-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: `${tone}15`, color: tone }}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-sm font-bold text-[#071B34]">{title}</div>
        <div className="text-xs text-[#475569] mt-0.5">{desc}</div>
      </div>
    </div>
  );
}

function StatRow({ icon: Icon, tone, label, value }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="inline-flex items-center gap-2 text-sm text-[#334155]">
        <span className="h-6 w-6 rounded-lg flex items-center justify-center" style={{ background: `${tone}15`, color: tone }}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        {label}
      </div>
      <span className="text-sm font-bold text-[#071B34]">{value}</span>
    </div>
  );
}

function IdeaCard({ idea, isAdmin, onNavigate, onChange }) {
  const st = statusMeta(idea.status);
  const StIcon = st.icon;
  const [moderating, setModerating] = useState(false);
  const del = async (e) => {
    e.stopPropagation();
    if (!window.confirm("Supprimer cette idée ?")) return;
    await api.delete(`/admin/ideas/${idea.id}`);
    toast.success("Supprimée");
    onChange();
  };
  return (
    <>
    <button
      onClick={onNavigate}
      data-testid={`idea-card-${idea.id}`}
      className="w-full text-left ms-card p-4 hover:shadow-md transition-shadow flex gap-4"
    >
      {/* Vote count */}
      <div className="flex flex-col items-center rounded-2xl bg-[#4338CA]/8 px-3 py-3 shrink-0 w-16">
        <ChevronUp className="h-5 w-5 text-[#4338CA]" />
        <div className="text-2xl font-bold text-[#4338CA] leading-none mt-0.5">{Math.max(0, idea.score)}</div>
        <div className="text-[10px] uppercase tracking-widest text-[#4338CA]/70 mt-0.5">votes</div>
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-base font-bold text-[#071B34] line-clamp-1">{idea.title}</h3>
        <div className="mt-1.5">
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#10B981] bg-[#10B981]/10 rounded-full px-2 py-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" /> {idea.category}
          </span>
        </div>
        <p className="text-sm text-[#475569] mt-2 line-clamp-2">{idea.description}</p>
        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-[#94A3B8]">
          <div className="inline-flex items-center gap-1.5">
            <span className="h-5 w-5 rounded-full bg-[#F4F7FA] inline-flex items-center justify-center">
              <UserCog className="h-3 w-3 text-[#94A3B8]" />
            </span>
            <span className="font-semibold text-[#475569]">
              {idea.is_anonymous ? "Anonyme" : `${idea.author_snapshot?.first_name || ""} ${idea.author_snapshot?.last_name || ""}`}
            </span>
            <span>•</span>
            <span>{formatDateFr(idea.created_at)}</span>
          </div>
          <div className="inline-flex items-center gap-1">
            <MessageCircle className="h-3.5 w-3.5" /> {idea.comments_count || 0} commentaires
          </div>
        </div>
      </div>
      <div className="flex flex-col items-end gap-2 shrink-0">
        <span className={`ms-chip !text-[10px] ${st.cls} inline-flex items-center gap-1`}>
          <StIcon className="h-3 w-3" /> {st.label}
        </span>
        {isAdmin && (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <span
              onClick={() => setModerating(true)}
              data-testid={`idea-moderate-${idea.id}`}
              className="cursor-pointer text-xs font-semibold text-[#1D70B8] hover:underline"
            >Modérer</span>
            <button
              onClick={del}
              data-testid={`idea-delete-${idea.id}`}
              className="h-6 w-6 rounded hover:bg-[#FEE2E2] text-[#B91C1C] inline-flex items-center justify-center"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        )}
        <ChevronRight className="h-4 w-4 text-[#94A3B8] mt-auto" />
      </div>
    </button>
    {moderating && <IdeaModerator idea={idea} onClose={() => setModerating(false)} onSaved={() => { setModerating(false); onChange(); }} />}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Modération admin (modale)
// ═══════════════════════════════════════════════════════════════════
function IdeaModerator({ idea, onClose, onSaved }) {
  const [status, setStatus] = useState(idea.status);
  const [response, setResponse] = useState(idea.admin_response || "");
  const save = async () => {
    await api.put(`/admin/ideas/${idea.id}`, { status, admin_response: response });
    toast.success("Idée mise à jour · L'auteur a été notifié");
    onSaved();
  };
  return (
    <PortalModal>
      <div onClick={onClose} className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
        <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-3xl w-full max-w-lg p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-[#071B34]">Modérer l&apos;idée</h3>
            <button onClick={onClose} className="h-9 w-9 rounded-lg hover:bg-[#F4F7FA] inline-flex items-center justify-center"><X className="h-4 w-4" /></button>
          </div>
          <div className="rounded-xl bg-[#F4F7FA] p-3">
            <div className="text-sm font-semibold text-[#071B34]">{idea.title}</div>
            <div className="text-xs text-[#475569] mt-1 line-clamp-3">{idea.description}</div>
          </div>
          <div>
            <label className="ms-overline">Statut</label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {STATUSES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setStatus(s.id)}
                  data-testid={`idea-status-${s.id}`}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold text-left flex items-center gap-2 transition-colors ${
                    status === s.id ? s.cls + " ring-2 ring-current" : "bg-[#F4F7FA] text-[#475569] hover:bg-[#071B34]/5"
                  }`}
                >
                  <s.icon className="h-4 w-4" /> {s.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="ms-overline">Réponse (visible par tous)</label>
            <textarea rows={4} value={response} onChange={(e) => setResponse(e.target.value)} data-testid="idea-admin-response" className="ms-input mt-1" placeholder="Expliquez la décision, les prochaines étapes…" />
          </div>
          <div className="flex gap-2 justify-end pt-3 border-t border-[#071B34]/5">
            <button onClick={onClose} className="ms-btn-outline">Annuler</button>
            <button onClick={save} className="ms-btn-primary"><Save className="h-4 w-4" /> Enregistrer et notifier</button>
          </div>
        </div>
      </div>
    </PortalModal>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Page 2 : Détail d'une idée
// ═══════════════════════════════════════════════════════════════════
export function IdeaDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { me, adminMode } = useApp();
  const isAdmin = !!me?.is_admin && adminMode !== false;
  const [idea, setIdea] = useState(null);
  const [tab, setTab] = useState("details");
  const [comment, setComment] = useState("");
  const [moderating, setModerating] = useState(false);

  const load = () => api.get(`/ideas/${id}`).then((r) => setIdea(r.data));
  useEffect(() => { load(); }, [id]);

  if (!idea) return <div className="ms-card p-10 text-center text-sm text-[#475569]">Chargement…</div>;

  const st = statusMeta(idea.status);
  const timeline = idea.status_history || [];

  const vote = async (direction) => {
    const next = idea.my_vote === direction ? "clear" : direction;
    const { data } = await api.post(`/ideas/${id}/vote?direction=${next}`);
    setIdea((prev) => ({ ...prev, ...data, comments: prev.comments, status_history: prev.status_history, author_snapshot: prev.author_snapshot, attachments: prev.attachments, related: prev.related }));
  };

  const toggleFollow = async () => {
    if (idea.me_followed) await api.delete(`/ideas/${id}/follow`);
    else await api.post(`/ideas/${id}/follow`);
    load();
    toast.success(idea.me_followed ? "Vous ne suivez plus cette idée" : "Vous suivez cette idée");
  };

  const sendComment = async () => {
    if (!comment.trim()) return;
    await api.post(`/ideas/${id}/comments`, { content: comment.trim() });
    setComment("");
    load();
  };

  const share = async () => {
    const url = window.location.href;
    try { await navigator.clipboard.writeText(url); toast.success("Lien copié !"); }
    catch { toast.info(url); }
  };

  return (
    <div className="space-y-5 ms-fade-up">
      <button
        onClick={() => navigate("/idees")}
        data-testid="idea-back"
        className="inline-flex items-center gap-1.5 text-sm text-[#475569] hover:text-[#071B34] font-semibold"
      >
        <ArrowLeft className="h-4 w-4" /> Retour à la boîte à idées
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start">
        <div className="space-y-4">
          {/* Header card */}
          <div className="ms-card p-6">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="text-xs text-[#475569] inline-flex items-center gap-2">
                  <span className="rounded-full bg-[#4338CA]/10 text-[#4338CA] px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest">Idée #{idea.id.slice(0, 4)}</span>
                  <span>Proposée le {formatDateFr(idea.created_at)} par</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#F4F7FA] px-2 py-0.5 font-semibold text-[#334155]">
                    <Shield className="h-3 w-3" /> {idea.is_anonymous ? "Anonyme" : `${idea.author_snapshot?.first_name} ${idea.author_snapshot?.last_name}`}
                  </span>
                </div>
                <h1 className="mt-3 text-2xl md:text-3xl font-bold tracking-tight text-[#071B34]">{idea.title}</h1>
                <div className="mt-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#4338CA] bg-[#4338CA]/10 rounded-full px-3 py-1">
                    <Lightbulb className="h-3.5 w-3.5" /> {idea.category}
                  </span>
                </div>
              </div>
              <span className={`ms-chip !text-xs ${st.cls} inline-flex items-center gap-1 !px-3 !py-1.5`}>
                <st.icon className="h-4 w-4" /> {st.label}
              </span>
            </div>

            <p className="mt-4 text-sm text-[#334155] whitespace-pre-wrap">{idea.description}</p>

            {idea.attachments && idea.attachments.length > 0 && (
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                {idea.attachments.slice(0, 3).map((url, i) => (
                  <a key={i} href={absoluteUrl(url)} target="_blank" rel="noreferrer" className="aspect-[4/3] rounded-2xl overflow-hidden bg-[#F4F7FA]">
                    <img src={absoluteUrl(url)} alt="" className="h-full w-full object-cover" />
                  </a>
                ))}
                {idea.attachments.length > 3 && (
                  <div className="aspect-[4/3] rounded-2xl border-2 border-dashed border-[#071B34]/15 flex items-center justify-center text-[#475569] font-bold text-lg">
                    +{idea.attachments.length - 3}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Vote block */}
          <div className="ms-card p-6">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="h-14 w-14 rounded-full bg-[#4338CA] text-white flex items-center justify-center">
                <ThumbsUp className="h-6 w-6" />
              </div>
              <div className="flex-1 min-w-[200px]">
                <div className="text-lg font-bold text-[#071B34]">Votez pour cette idée !</div>
                <div className="text-xs text-[#475569] mt-0.5">Votre vote compte pour faire avancer les bonnes idées.</div>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-[#071B34]">{Math.max(0, idea.score)}</div>
                <div className="text-[10px] uppercase tracking-widest text-[#475569] font-semibold">votes au total</div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                onClick={() => vote("up")}
                data-testid="idea-vote-up"
                className={`rounded-2xl py-3 inline-flex items-center justify-center gap-2 font-bold text-sm transition-colors ${
                  idea.my_vote === "up"
                    ? "bg-[#4338CA] text-white ring-2 ring-[#4338CA]/40"
                    : "bg-[#4338CA] text-white hover:bg-[#3730A3]"
                }`}
              >
                <ThumbsUp className="h-4 w-4" /> Je vote pour
              </button>
              <button
                onClick={() => vote("down")}
                data-testid="idea-vote-down"
                className={`rounded-2xl py-3 inline-flex items-center justify-center gap-2 font-bold text-sm border-2 transition-colors ${
                  idea.my_vote === "down"
                    ? "border-[#4338CA] bg-[#4338CA]/10 text-[#4338CA]"
                    : "border-[#4338CA] bg-white text-[#4338CA] hover:bg-[#4338CA]/5"
                }`}
              >
                <ThumbsDown className="h-4 w-4" /> Je ne vote pas
              </button>
            </div>
            {idea.my_vote && (
              <div className="mt-3 rounded-2xl bg-[#10B981]/10 text-[#047857] px-4 py-2.5 text-sm inline-flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Merci ! Votre vote a bien été enregistré.
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="ms-card p-0 overflow-hidden">
            <div className="px-6 border-b border-[#071B34]/5 flex items-center gap-5">
              {[
                { k: "details", l: "Détails" },
                { k: "comments", l: `Commentaires (${idea.comments_count || 0})` },
                { k: "history", l: "Historique" },
              ].map((t) => (
                <button
                  key={t.k}
                  onClick={() => setTab(t.k)}
                  data-testid={`idea-tab-${t.k}`}
                  className={`relative py-3 text-sm font-semibold ${tab === t.k ? "text-[#4338CA]" : "text-[#475569] hover:text-[#071B34]"}`}
                >
                  {t.l}
                  {tab === t.k && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-[#4338CA] rounded-t" />}
                </button>
              ))}
            </div>
            <div className="p-6">
              {tab === "details" && (
                <div className="grid grid-cols-1 md:grid-cols-[1fr_240px] gap-5">
                  <div>
                    <div className="text-sm font-bold text-[#071B34] mb-2">Description détaillée</div>
                    <p className="text-sm text-[#334155] whitespace-pre-wrap">{idea.description}</p>
                    {idea.admin_response && (
                      <div className="mt-4 rounded-2xl bg-[#3BA4FF]/8 border-l-4 border-[#3BA4FF] px-4 py-3">
                        <div className="text-xs font-bold text-[#1D70B8] uppercase tracking-widest">Réponse de la direction</div>
                        <p className="text-sm text-[#334155] mt-1 whitespace-pre-wrap">{idea.admin_response}</p>
                      </div>
                    )}
                  </div>
                  <div className="rounded-2xl bg-[#F8FAFC] p-4">
                    <div className="text-sm font-bold text-[#071B34] mb-2">Informations</div>
                    <InfoLine k="Catégorie" v={idea.category} />
                    <InfoLine k="Proposée le" v={formatDateFr(idea.created_at)} />
                    <InfoLine k="Proposée par" v={idea.is_anonymous ? "Anonyme" : `${idea.author_snapshot?.first_name} ${idea.author_snapshot?.last_name}`} />
                    <InfoLine k="Statut" v={<span className={`ms-chip !text-[10px] ${st.cls}`}>{st.label}</span>} />
                    <InfoLine k="Mise à jour" v={idea.moderated_at ? formatDateFr(idea.moderated_at) : "—"} />
                  </div>
                </div>
              )}

              {tab === "comments" && (
                <div className="space-y-3">
                  {(idea.comments || []).map((c) => (
                    <div key={c.id} className="flex gap-3">
                      <div className="h-9 w-9 rounded-full bg-[#F4F7FA] text-[#475569] inline-flex items-center justify-center text-xs font-bold shrink-0">
                        {(c.author_snapshot?.first_name || "?")[0]}
                      </div>
                      <div className="flex-1 rounded-2xl bg-[#F4F7FA] px-3 py-2">
                        <div className="text-xs font-bold text-[#071B34]">
                          {c.author_snapshot?.first_name} {c.author_snapshot?.last_name}
                          <span className="ml-2 text-[10px] font-normal text-[#94A3B8]">{formatDateFr(c.created_at)}</span>
                        </div>
                        <div className="text-sm text-[#334155] mt-0.5 whitespace-pre-wrap">{c.content}</div>
                      </div>
                    </div>
                  ))}
                  {(idea.comments || []).length === 0 && (
                    <div className="text-sm text-[#475569] italic text-center py-6">Aucun commentaire — soyez le premier !</div>
                  )}
                  <div className="flex gap-2 pt-3 border-t border-[#071B34]/5">
                    <input
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); sendComment(); } }}
                      placeholder="Ajouter un commentaire…"
                      data-testid="idea-comment-input"
                      className="ms-input flex-1 !py-2"
                    />
                    <button onClick={sendComment} data-testid="idea-comment-send" className="ms-btn-primary"><Send className="h-4 w-4" /></button>
                  </div>
                </div>
              )}

              {tab === "history" && (
                <ol className="relative ml-3 border-l-2 border-[#071B34]/10 space-y-4">
                  {timeline.slice().reverse().map((h, i) => {
                    const m = statusMeta(h.status);
                    return (
                      <li key={i} className="pl-5 relative">
                        <span className="absolute -left-[9px] top-1 h-4 w-4 rounded-full bg-white border-2 border-[#4338CA]" />
                        <div className="text-xs font-bold text-[#071B34]">{m.label}</div>
                        <div className="text-[11px] text-[#475569]">{new Date(h.at).toLocaleString("fr-FR")}</div>
                      </li>
                    );
                  })}
                  {timeline.length === 0 && <div className="text-sm text-[#475569] italic">Aucun événement</div>}
                </ol>
              )}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4 lg:sticky lg:top-24">
          {/* Timeline */}
          <div className="ms-card p-5">
            <div className="text-sm font-bold text-[#071B34] mb-3">Statut de l&apos;idée</div>
            <ol className="space-y-4">
              {["reviewing", "accepted", "delivered"].map((sid) => {
                const m = statusMeta(sid);
                const reached = timeline.some((h) => h.status === sid) || (sid === "reviewing" && idea.status !== "new") || (sid === "accepted" && (idea.status === "accepted" || idea.status === "delivered"));
                const currentIdx = timeline.findIndex((h) => h.status === sid);
                const at = currentIdx >= 0 ? timeline[currentIdx].at : null;
                const active = idea.status === sid;
                return (
                  <li key={sid} className="flex gap-3">
                    <div className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 ${reached ? "bg-[#10B981] text-white" : "bg-[#F4F7FA] text-[#94A3B8] ring-2 ring-[#071B34]/10"}`}>
                      {reached ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3 w-3" />}
                    </div>
                    <div>
                      <div className={`text-sm font-bold ${active ? "text-[#10B981]" : reached ? "text-[#071B34]" : "text-[#475569]"}`}>{m.label}</div>
                      {at && <div className="text-[11px] text-[#475569] mt-0.5">Depuis le {formatDateFr(at)}</div>}
                      {active && idea.admin_response && (
                        <div className="text-[11px] text-[#334155] mt-1 max-w-[200px]">{idea.admin_response}</div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          {/* Share */}
          <div className="ms-card p-5">
            <div className="text-sm font-bold text-[#071B34]">Partager cette idée</div>
            <p className="text-xs text-[#475569] mt-1">Partagez cette idée avec vos collègues !</p>
            <button
              onClick={share}
              data-testid="idea-share"
              className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-xl border-2 border-[#4338CA]/30 hover:bg-[#4338CA]/5 py-2 text-sm font-bold text-[#4338CA]"
            >
              <Share2 className="h-4 w-4" /> Partager
            </button>
          </div>

          {/* Actions */}
          <div className="ms-card p-5 space-y-3">
            <div className="text-sm font-bold text-[#071B34]">Actions</div>
            <button
              onClick={toggleFollow}
              data-testid="idea-follow"
              className="w-full flex items-center gap-3 rounded-xl hover:bg-[#F4F7FA] p-2 -mx-2 text-left"
            >
              <Bell className={`h-5 w-5 ${idea.me_followed ? "text-[#4338CA] fill-[#4338CA]/20" : "text-[#475569]"}`} />
              <div>
                <div className="text-sm font-bold text-[#071B34]">{idea.me_followed ? "Ne plus suivre" : "Suivre cette idée"}</div>
                <div className="text-[11px] text-[#475569]">Recevoir les mises à jour</div>
              </div>
            </button>
            {isAdmin && (
              <button
                onClick={() => setModerating(true)}
                data-testid="idea-moderate-btn"
                className="w-full flex items-center gap-3 rounded-xl hover:bg-[#F4F7FA] p-2 -mx-2 text-left"
              >
                <UserCog className="h-5 w-5 text-[#4338CA]" />
                <div>
                  <div className="text-sm font-bold text-[#071B34]">Modérer</div>
                  <div className="text-[11px] text-[#475569]">Changer le statut + notifier</div>
                </div>
              </button>
            )}
          </div>

          {/* Related */}
          {(idea.related || []).length > 0 && (
            <div className="ms-card p-5">
              <div className="text-sm font-bold text-[#071B34]">Vous aimerez peut-être</div>
              <div className="mt-3 space-y-3">
                {idea.related.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => navigate(`/idees/${r.id}`)}
                    className="w-full flex items-start gap-2 text-left hover:bg-[#F4F7FA] rounded-xl p-2 -mx-2"
                  >
                    <div className="h-7 w-7 rounded-lg bg-[#4338CA]/10 text-[#4338CA] flex items-center justify-center shrink-0">
                      <Lightbulb className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-[#071B34] line-clamp-2">{r.title}</div>
                      <div className="text-[10px] text-[#475569] mt-0.5">{r.votes} votes</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {moderating && <IdeaModerator idea={idea} onClose={() => setModerating(false)} onSaved={() => { setModerating(false); load(); }} />}
    </div>
  );
}

function InfoLine({ k, v }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <dt className="text-[#475569]">{k}</dt>
      <dd className="text-[#071B34] font-semibold text-right truncate max-w-[60%]">{v}</dd>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Page 3 : Proposer une idée
// ═══════════════════════════════════════════════════════════════════
export function IdeaSubmit() {
  const navigate = useNavigate();
  const [f, setF] = useState({ title: "", description: "", category: "", is_anonymous: true, attachments: [] });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!f.title.trim()) { toast.error("Le titre est obligatoire"); return; }
    if (!f.category) { toast.error("La catégorie est obligatoire"); return; }
    if (!f.description.trim()) { toast.error("La description est obligatoire"); return; }
    setSaving(true);
    try {
      const { data } = await api.post("/ideas", f);
      toast.success(f.is_anonymous ? "Idée publiée anonymement !" : "Idée publiée !");
      navigate(`/idees/${data.id}`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Erreur");
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-5 ms-fade-up">
      <button onClick={() => navigate("/idees")} data-testid="submit-back" className="inline-flex items-center gap-1.5 text-sm text-[#475569] hover:text-[#071B34] font-semibold">
        <ArrowLeft className="h-4 w-4" /> Retour
      </button>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start">
        <div className="ms-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-[#4338CA]/15 text-[#4338CA] flex items-center justify-center">
              <Lightbulb className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[#071B34]">Proposer une idée</h1>
              <p className="text-sm text-[#475569]">Votre idée peut faire la différence ! Partagez-la avec vos collègues.</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-[#071B34]">Titre de votre idée <span className="text-[#EF4444]">*</span></label>
            <input
              value={f.title}
              onChange={(e) => setF({ ...f, title: e.target.value.slice(0, 100) })}
              placeholder="Donnez un titre clair et concis à votre idée"
              data-testid="submit-title"
              className="ms-input mt-1"
            />
            <div className="text-[11px] text-[#94A3B8] text-right mt-1">{f.title.length}/100</div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-[#071B34]">Catégorie <span className="text-[#EF4444]">*</span></label>
            <select
              value={f.category}
              onChange={(e) => setF({ ...f, category: e.target.value })}
              data-testid="submit-category"
              className="ms-input mt-1"
            >
              <option value="">Sélectionnez une catégorie</option>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-[#071B34]">Description détaillée <span className="text-[#EF4444]">*</span></label>
            <textarea
              rows={8}
              value={f.description}
              onChange={(e) => setF({ ...f, description: e.target.value.slice(0, 2000) })}
              placeholder="Décrivez votre idée en détail. Plus vous êtes précis, plus votre idée pourra être comprise et évaluée."
              data-testid="submit-description"
              className="ms-input mt-1"
            />
            <div className="text-[11px] text-[#94A3B8] text-right mt-1">{f.description.length}/2000</div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-[#071B34]">Ajoutez des images ou fichiers (optionnel)</label>
            <div className="mt-2">
              <ImageUpload
                value={f.attachments}
                onChange={(list) => setF({ ...f, attachments: list })}
                mode="multiple"
                testId="submit-attachments"
              />
              <p className="text-[11px] text-[#94A3B8] mt-1">Formats acceptés : JPG, PNG (max 10 Mo par fichier)</p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-[#071B34]/10 p-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-2xl bg-[#4338CA]/10 text-[#4338CA] flex items-center justify-center">
                <Shield className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-bold text-[#071B34]">Rendre l&apos;idée anonyme</div>
                <div className="text-[11px] text-[#475569]">Si cette option est activée, votre nom ne sera pas visible par les autres utilisateurs.</div>
              </div>
            </div>
            <button
              onClick={() => setF({ ...f, is_anonymous: !f.is_anonymous })}
              data-testid="submit-anon"
              className={`relative h-6 w-11 rounded-full transition-colors ${f.is_anonymous ? "bg-[#4338CA]" : "bg-[#94A3B8]/30"}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${f.is_anonymous ? "left-5" : "left-0.5"}`} />
            </button>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-[#071B34]/5 flex-wrap gap-2">
            <div className="text-xs text-[#475569] inline-flex items-center gap-1.5">
              <Shield className="h-4 w-4" /> Toutes les idées sont lues et traitées avec bienveillance.
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => navigate("/idees")} className="ms-btn-outline">Annuler</button>
              <button onClick={submit} disabled={saving} data-testid="submit-send" className="rounded-xl bg-[#4338CA] hover:bg-[#3730A3] text-white font-bold px-4 py-2.5 inline-flex items-center gap-2 disabled:opacity-50">
                <Send className="h-4 w-4" /> {saving ? "Envoi…" : "Envoyer mon idée"}
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="ms-card p-5">
            <div className="text-sm font-bold text-[#071B34]">Avant de proposer</div>
            {[
              { i: Lightbulb, tone: "#4338CA", t: "Soyez clair et précis", d: "Expliquez le problème rencontré et votre solution proposée." },
              { i: Target, tone: "#F59E0B", t: "Une idée par proposition", d: "Pour plus de lisibilité, privilégiez une idée par envoi." },
              { i: Users, tone: "#10B981", t: "Respect et bienveillance", d: "Toutes les idées sont importantes. Restons respectueux dans les échanges." },
              { i: Shield, tone: "#3BA4FF", t: "Suivi transparent", d: "Vous serez informé de l'avancement de votre idée." },
            ].map((t, idx) => (
              <div key={idx} className="flex items-start gap-3 mt-3 first:mt-3">
                <div className="h-9 w-9 rounded-2xl flex items-center justify-center shrink-0" style={{ background: `${t.tone}15`, color: t.tone }}>
                  <t.i className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-[#071B34]">{t.t}</div>
                  <div className="text-[11px] text-[#475569]">{t.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
