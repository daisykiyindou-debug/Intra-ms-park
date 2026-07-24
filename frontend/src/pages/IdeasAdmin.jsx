import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Lightbulb, Search, FileText, ThumbsUp, CheckCircle2, XCircle, Clock as ClockIcon,
  Sparkles, Target, Trash2, Eye, UserCog, Save, X, Shield,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";
import PortalModal from "@/components/PortalModal";

const STATUSES = [
  { id: "new", label: "En attente", cls: "bg-[#94A3B8]/15 text-[#475569]", icon: ClockIcon },
  { id: "reviewing", label: "En étude", cls: "bg-[#F59E0B]/15 text-[#B45309]", icon: Sparkles },
  { id: "accepted", label: "Validée", cls: "bg-[#10B981]/15 text-[#047857]", icon: CheckCircle2 },
  { id: "rejected", label: "Refusée", cls: "bg-[#EF4444]/15 text-[#B91C1C]", icon: XCircle },
  { id: "delivered", label: "Mise en place", cls: "bg-[#3BA4FF]/15 text-[#1D70B8]", icon: Target },
];
const meta = (s) => STATUSES.find((x) => x.id === s) || STATUSES[0];

function fmt(iso) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

export default function IdeasAdmin() {
  const { me, adminMode } = useApp();
  const canManage = !!me?.is_admin && adminMode !== false;
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({ total_ideas: 0, total_votes: 0, accepted: 0, reviewing: 0, rejected: 0 });
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState(null);

  const load = async () => {
    if (!canManage) return;
    const [{ data: list }, { data: st }] = await Promise.all([
      api.get("/ideas"),
      api.get("/ideas/stats"),
    ]);
    setItems(list);
    setStats(st);
  };
  useEffect(() => { load(); }, [canManage]);

  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (status !== "all" && i.status !== status) return false;
      if (q.trim() && !`${i.title} ${i.description} ${i.category}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    }).sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [items, q, status]);

  const del = async (i) => {
    if (!window.confirm(`Supprimer « ${i.title} » ?`)) return;
    await api.delete(`/admin/ideas/${i.id}`);
    toast.success("Idée supprimée");
    load();
  };

  if (!canManage) {
    return (
      <div className="ms-card p-10 text-center">
        <Lightbulb className="mx-auto h-10 w-10 text-[#94A3B8]" />
        <h2 className="mt-3 text-lg font-bold text-[#071B34]">Mode administrateur désactivé</h2>
        <p className="mt-2 text-sm text-[#475569]">
          Activez le mode administrateur pour gérer les idées reçues.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="ms-overline">Administration › Boîte à idées</div>
          <div className="mt-1 flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-[#4338CA]/15 text-[#4338CA] flex items-center justify-center">
              <Lightbulb className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[#071B34]">Boîte à idées</h1>
              <p className="text-sm text-[#475569] mt-0.5">
                Recevez, étudiez et validez les idées de vos collaborateurs. L&apos;auteur est notifié à chaque changement de statut (même pour les idées anonymes).
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KPI icon={FileText} tone="#4338CA" label="Idées reçues" v={stats.total_ideas} testid="admin-idea-kpi-total" />
        <KPI icon={ThumbsUp} tone="#10B981" label="Votes cumulés" v={stats.total_votes} />
        <KPI icon={Sparkles} tone="#F59E0B" label="En étude" v={stats.reviewing} />
        <KPI icon={CheckCircle2} tone="#10B981" label="Validées" v={stats.accepted} />
        <KPI icon={XCircle} tone="#EF4444" label="Refusées" v={stats.rejected} />
      </div>

      {/* Filters */}
      <div className="ms-card p-3 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[220px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher une idée…"
            data-testid="admin-idea-search"
            className="ms-input pl-9"
          />
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <button
            onClick={() => setStatus("all")}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${status === "all" ? "bg-[#071B34] text-white" : "bg-[#F4F7FA] text-[#475569] hover:bg-[#071B34]/5"}`}
          >
            Toutes ({items.length})
          </button>
          {STATUSES.map((s) => {
            const c = items.filter((i) => i.status === s.id).length;
            return (
              <button
                key={s.id}
                onClick={() => setStatus(s.id)}
                data-testid={`admin-idea-filter-${s.id}`}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold inline-flex items-center gap-1.5 ${
                  status === s.id ? "bg-[#071B34] text-white" : "bg-[#F4F7FA] text-[#475569] hover:bg-[#071B34]/5"
                }`}
              >
                <s.icon className="h-3 w-3" /> {s.label} ({c})
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div className="ms-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-[#F4F7FA]">
              <tr className="text-left text-[10px] uppercase tracking-widest text-[#475569] font-semibold">
                <th className="px-4 py-3">Idée</th>
                <th className="px-4 py-3">Catégorie</th>
                <th className="px-4 py-3">Auteur</th>
                <th className="px-4 py-3">Reçue le</th>
                <th className="px-4 py-3">Votes</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#071B34]/5">
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-[#475569]">Aucune idée.</td></tr>
              )}
              {filtered.map((i) => {
                const m = meta(i.status);
                return (
                  <tr key={i.id} className="hover:bg-[#F4F7FA]">
                    <td className="px-4 py-3 max-w-[320px]">
                      <div className="text-sm font-bold text-[#071B34] truncate">{i.title}</div>
                      <div className="text-xs text-[#475569] mt-0.5 line-clamp-1">{i.description}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#4338CA] bg-[#4338CA]/10 rounded-full px-2 py-0.5">
                        {i.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {i.is_anonymous ? (
                        <span className="inline-flex items-center gap-1 text-[#475569] font-semibold">
                          <Shield className="h-3 w-3" /> Anonyme
                        </span>
                      ) : (
                        <span className="text-[#334155] font-semibold">
                          {i.author_snapshot?.first_name} {i.author_snapshot?.last_name}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-[#334155]">{fmt(i.created_at)}</td>
                    <td className="px-4 py-3 text-sm font-bold text-[#4338CA]">{Math.max(0, i.score)}</td>
                    <td className="px-4 py-3">
                      <span className={`ms-chip !text-[10px] ${m.cls} inline-flex items-center gap-1`}>
                        <m.icon className="h-3 w-3" /> {m.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Link
                          to={`/idees/${i.id}`}
                          data-testid={`admin-idea-view-${i.id}`}
                          className="h-8 w-8 inline-flex items-center justify-center rounded-lg hover:bg-[#3BA4FF]/10 text-[#3BA4FF]"
                          title="Voir"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Link>
                        <button
                          onClick={() => setSelected(i)}
                          data-testid={`admin-idea-moderate-${i.id}`}
                          className="h-8 px-2.5 inline-flex items-center gap-1 rounded-lg bg-[#4338CA]/10 hover:bg-[#4338CA]/20 text-[#4338CA] text-xs font-semibold"
                        >
                          <UserCog className="h-3.5 w-3.5" /> Modérer
                        </button>
                        <button
                          onClick={() => del(i)}
                          data-testid={`admin-idea-delete-${i.id}`}
                          className="h-8 w-8 inline-flex items-center justify-center rounded-lg hover:bg-[#FEE2E2] text-[#B91C1C]"
                          title="Supprimer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selected && <IdeaAdminModerator idea={selected} onClose={() => setSelected(null)} onSaved={() => { setSelected(null); load(); }} />}
    </div>
  );
}

function KPI({ icon: Icon, tone, label, v, testid }) {
  return (
    <div className="ms-card p-4 flex items-center gap-3" data-testid={testid}>
      <div className="h-11 w-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: `${tone}15`, color: tone }}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-2xl font-bold text-[#071B34] leading-tight">{v}</div>
        <div className="text-[11px] uppercase tracking-widest text-[#475569] font-semibold">{label}</div>
      </div>
    </div>
  );
}

function IdeaAdminModerator({ idea, onClose, onSaved }) {
  const [status, setStatus] = useState(idea.status);
  const [response, setResponse] = useState(idea.admin_response || "");
  const save = async () => {
    await api.put(`/admin/ideas/${idea.id}`, { status, admin_response: response });
    toast.success("Statut mis à jour · L'auteur a été notifié");
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
            <div className="text-xs text-[#475569] mt-1 whitespace-pre-wrap line-clamp-3">{idea.description}</div>
          </div>
          <div>
            <label className="ms-overline">Statut</label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {STATUSES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setStatus(s.id)}
                  data-testid={`admin-status-${s.id}`}
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
            <textarea
              rows={4}
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              data-testid="admin-idea-response"
              className="ms-input mt-1"
              placeholder="Expliquez la décision, les prochaines étapes…"
            />
          </div>
          <div className="flex gap-2 justify-end pt-3 border-t border-[#071B34]/5">
            <button onClick={onClose} className="ms-btn-outline">Annuler</button>
            <button onClick={save} data-testid="admin-idea-save" className="ms-btn-primary">
              <Save className="h-4 w-4" /> Enregistrer et notifier
            </button>
          </div>
        </div>
      </div>
    </PortalModal>
  );
}
