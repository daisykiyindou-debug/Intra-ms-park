import { useEffect, useMemo, useState } from "react";
import {
  Lightbulb, Plus, ChevronUp, ChevronDown, X, Filter, Search, Save,
  CheckCircle2, XCircle, Clock as ClockIcon, Sparkles, Trash2, Shield,
  UserCog,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";
import PortalModal from "@/components/PortalModal";

const CATEGORIES = ["Amélioration", "Événement", "Bien-être", "Technologie", "Environnement", "Autres"];

const STATUSES = [
  { id: "new", label: "Nouvelle", cls: "bg-[#3BA4FF]/15 text-[#1D70B8]", icon: Sparkles },
  { id: "reviewing", label: "À l'étude", cls: "bg-[#F59E0B]/15 text-[#B45309]", icon: ClockIcon },
  { id: "accepted", label: "Retenue", cls: "bg-[#10B981]/15 text-[#047857]", icon: CheckCircle2 },
  { id: "rejected", label: "Non retenue", cls: "bg-[#EF4444]/15 text-[#B91C1C]", icon: XCircle },
];

const statusMeta = (id) => STATUSES.find((s) => s.id === id) || STATUSES[0];

export default function Ideas() {
  const { me, adminMode } = useApp();
  const isAdmin = !!me?.is_admin && adminMode !== false;

  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [catFilter, setCatFilter] = useState("all");
  const [composerOpen, setComposerOpen] = useState(false);
  const [moderating, setModerating] = useState(null);

  const load = () => api.get("/ideas").then((r) => setItems(r.data));
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (statusFilter !== "all" && i.status !== statusFilter) return false;
      if (catFilter !== "all" && i.category !== catFilter) return false;
      if (q.trim()) {
        const n = q.toLowerCase();
        return `${i.title} ${i.description} ${i.category}`.toLowerCase().includes(n);
      }
      return true;
    }).sort((a, b) => b.score - a.score);
  }, [items, statusFilter, catFilter, q]);

  const vote = async (i, direction) => {
    const next = i.my_vote === direction ? "clear" : direction;
    const { data } = await api.post(`/ideas/${i.id}/vote?direction=${next}`);
    setItems((list) => list.map((x) => (x.id === i.id ? data : x)));
  };

  const del = async (i) => {
    if (!window.confirm("Supprimer cette idée ?")) return;
    await api.delete(`/admin/ideas/${i.id}`);
    toast.success("Idée supprimée");
    load();
  };

  return (
    <div className="space-y-6 ms-fade-up">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="ms-overline">Vie de l&apos;entreprise › Boîte à idées</div>
          <div className="mt-1 flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-[#F59E0B]/15 text-[#B45309] flex items-center justify-center">
              <Lightbulb className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[#071B34]">
                Boîte à idées
              </h1>
              <p className="text-sm text-[#475569] mt-0.5 max-w-2xl">
                Proposez vos idées pour améliorer MS Park — anonymement si vous préférez — et votez pour celles de vos collègues. La direction étudie et retient les meilleures.
              </p>
            </div>
          </div>
        </div>
        <button
          onClick={() => setComposerOpen(true)}
          data-testid="new-idea"
          className="ms-btn-primary"
        >
          <Plus className="h-4 w-4" /> Proposer une idée
        </button>
      </div>

      {/* Filters */}
      <div className="ms-card p-3 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[220px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher une idée…"
            data-testid="idea-search"
            className="ms-input pl-9"
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="ms-input max-w-[200px]">
          <option value="all">Tous les statuts</option>
          {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="ms-input max-w-[200px]">
          <option value="all">Toutes catégories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Idea list */}
      {filtered.length === 0 && (
        <div className="ms-card p-10 text-center">
          <Lightbulb className="mx-auto h-10 w-10 text-[#94A3B8]" />
          <p className="mt-3 text-sm text-[#475569]">
            Aucune idée pour le moment. Soyez le premier à en proposer une !
          </p>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filtered.map((i) => {
          const stMeta = statusMeta(i.status);
          const StIcon = stMeta.icon;
          return (
            <div
              key={i.id}
              data-testid={`idea-${i.id}`}
              className="ms-card p-4 flex gap-3 h-full"
            >
              {/* Vote column */}
              <div className="flex flex-col items-center gap-1 shrink-0">
                <button
                  onClick={() => vote(i, "up")}
                  data-testid={`idea-up-${i.id}`}
                  aria-label="Voter pour"
                  className={`h-9 w-9 rounded-xl flex items-center justify-center transition-colors ${
                    i.my_vote === "up"
                      ? "bg-[#10B981]/15 text-[#047857]"
                      : "bg-[#F4F7FA] hover:bg-[#10B981]/10 text-[#475569] hover:text-[#047857]"
                  }`}
                >
                  <ChevronUp className="h-5 w-5" />
                </button>
                <div className={`text-sm font-bold ${i.score > 0 ? "text-[#047857]" : i.score < 0 ? "text-[#B91C1C]" : "text-[#334155]"}`}>
                  {i.score > 0 ? "+" : ""}{i.score}
                </div>
                <button
                  onClick={() => vote(i, "down")}
                  data-testid={`idea-down-${i.id}`}
                  aria-label="Voter contre"
                  className={`h-9 w-9 rounded-xl flex items-center justify-center transition-colors ${
                    i.my_vote === "down"
                      ? "bg-[#EF4444]/15 text-[#B91C1C]"
                      : "bg-[#F4F7FA] hover:bg-[#EF4444]/10 text-[#475569] hover:text-[#B91C1C]"
                  }`}
                >
                  <ChevronDown className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 min-w-0 flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-base font-bold text-[#071B34] line-clamp-2">{i.title}</h3>
                  <span className={`ms-chip !text-[10px] whitespace-nowrap ${stMeta.cls}`}>
                    <StIcon className="h-3 w-3" /> {stMeta.label}
                  </span>
                </div>
                <p className="text-xs text-[#475569] mt-1.5 whitespace-pre-wrap line-clamp-4">{i.description}</p>
                <div className="mt-3 flex items-center gap-2 flex-wrap text-[10px] uppercase tracking-widest font-semibold">
                  <span className="ms-chip bg-[#F4F7FA] text-[#475569]">{i.category}</span>
                  {i.is_anonymous ? (
                    <span className="ms-chip bg-[#94A3B8]/15 text-[#475569] inline-flex items-center gap-1">
                      <Shield className="h-3 w-3" /> Anonyme
                    </span>
                  ) : (
                    <span className="ms-chip bg-[#3BA4FF]/10 text-[#1D70B8]">
                      {i.author_snapshot?.first_name} {i.author_snapshot?.last_name}
                    </span>
                  )}
                  <span className="text-[10px] text-[#94A3B8] normal-case tracking-normal ml-auto">
                    {new Date(i.created_at).toLocaleDateString("fr-FR")}
                  </span>
                </div>

                {i.admin_response && (
                  <div className="mt-3 rounded-xl bg-[#3BA4FF]/8 border-l-4 border-[#3BA4FF] px-3 py-2">
                    <div className="text-[10px] uppercase tracking-widest font-bold text-[#1D70B8] flex items-center gap-1">
                      <UserCog className="h-3 w-3" /> Réponse de la direction
                    </div>
                    <p className="text-xs text-[#334155] mt-1 whitespace-pre-wrap">{i.admin_response}</p>
                  </div>
                )}

                {isAdmin && (
                  <div className="mt-3 pt-3 border-t border-[#071B34]/5 flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => setModerating(i)}
                      data-testid={`idea-moderate-${i.id}`}
                      className="text-xs font-semibold text-[#1D70B8] hover:underline inline-flex items-center gap-1"
                    >
                      <UserCog className="h-3 w-3" /> Modérer
                    </button>
                    <button
                      onClick={() => del(i)}
                      data-testid={`idea-delete-${i.id}`}
                      className="text-xs font-semibold text-[#B91C1C] hover:underline inline-flex items-center gap-1"
                    >
                      <Trash2 className="h-3 w-3" /> Supprimer
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {composerOpen && <IdeaComposer onClose={() => setComposerOpen(false)} onSaved={() => { setComposerOpen(false); load(); }} />}
      {moderating && <IdeaModerator idea={moderating} onClose={() => setModerating(null)} onSaved={() => { setModerating(null); load(); }} />}
    </div>
  );
}

function IdeaComposer({ onClose, onSaved }) {
  const [f, setF] = useState({
    title: "", description: "", category: "Amélioration", is_anonymous: true,
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!f.title.trim() || !f.description.trim()) {
      toast.error("Titre et description obligatoires");
      return;
    }
    setSaving(true);
    try {
      await api.post("/ideas", f);
      toast.success(f.is_anonymous ? "Idée publiée anonymement" : "Idée publiée");
      onSaved();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Erreur");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PortalModal>
      <div onClick={onClose} className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
        <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-3xl w-full max-w-lg p-6 space-y-3" data-testid="idea-composer">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-[#071B34]">Proposer une idée</h3>
            <button onClick={onClose} className="h-9 w-9 rounded-lg hover:bg-[#F4F7FA] inline-flex items-center justify-center">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div>
            <label className="ms-overline">Titre *</label>
            <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} data-testid="idea-title" className="ms-input mt-1" placeholder="Ex : Un baby-foot dans la salle détente" />
          </div>
          <div>
            <label className="ms-overline">Description *</label>
            <textarea rows={5} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} data-testid="idea-description" className="ms-input mt-1" placeholder="Expliquez votre idée, son intérêt, comment la mettre en œuvre…" />
          </div>
          <div>
            <label className="ms-overline">Catégorie</label>
            <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} className="ms-input mt-1">
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-[#334155] cursor-pointer">
            <input
              type="checkbox"
              checked={f.is_anonymous}
              onChange={(e) => setF({ ...f, is_anonymous: e.target.checked })}
              data-testid="idea-anon"
            />
            <Shield className="h-4 w-4 text-[#475569]" />
            Publier de manière anonyme <span className="text-[#475569]">(personne ne verra que c&apos;est vous, pas même l&apos;administrateur)</span>
          </label>
          <div className="flex gap-2 justify-end pt-3 border-t border-[#071B34]/5">
            <button onClick={onClose} className="ms-btn-outline">Annuler</button>
            <button onClick={save} disabled={saving} data-testid="idea-save" className="ms-btn-primary disabled:opacity-50">
              <Save className="h-4 w-4" /> Publier
            </button>
          </div>
        </div>
      </div>
    </PortalModal>
  );
}

function IdeaModerator({ idea, onClose, onSaved }) {
  const [status, setStatus] = useState(idea.status);
  const [response, setResponse] = useState(idea.admin_response || "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/admin/ideas/${idea.id}`, { status, admin_response: response });
      toast.success("Idée mise à jour");
      onSaved();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Erreur");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PortalModal>
      <div onClick={onClose} className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
        <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-3xl w-full max-w-lg p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-[#071B34]">Modérer l&apos;idée</h3>
            <button onClick={onClose} className="h-9 w-9 rounded-lg hover:bg-[#F4F7FA] inline-flex items-center justify-center">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="rounded-xl bg-[#F4F7FA] p-3">
            <div className="text-sm font-semibold text-[#071B34]">{idea.title}</div>
            <div className="text-xs text-[#475569] mt-1 whitespace-pre-wrap">{idea.description}</div>
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
            <button onClick={save} disabled={saving} data-testid="idea-moderate-save" className="ms-btn-primary disabled:opacity-50">
              <Save className="h-4 w-4" /> Enregistrer
            </button>
          </div>
        </div>
      </div>
    </PortalModal>
  );
}
