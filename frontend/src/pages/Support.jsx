import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  LifeBuoy, Plus, ArrowLeft, Search, X, Send, Paperclip, Cpu, Monitor,
  Wifi, KeyRound, User as UserIcon, MoreHorizontal, HelpCircle, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { api, absoluteUrl, formatDateFr } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";
import PortalModal from "@/components/PortalModal";

const CATEGORIES = [
  { k: "hardware", l: "Matériel", ic: Cpu },
  { k: "software", l: "Logiciel", ic: Monitor },
  { k: "network", l: "Réseau", ic: Wifi },
  { k: "access", l: "Accès / mot de passe", ic: KeyRound },
  { k: "account", l: "Compte", ic: UserIcon },
  { k: "other", l: "Autre", ic: MoreHorizontal },
];
const PRIORITIES = [
  { k: "low", l: "Basse", cls: "bg-[#94A3B8]/15 text-[#475569]" },
  { k: "normal", l: "Normale", cls: "bg-[#3BA4FF]/15 text-[#1D70B8]" },
  { k: "high", l: "Haute", cls: "bg-[#F59E0B]/15 text-[#B45309]" },
  { k: "urgent", l: "Urgente", cls: "bg-[#EF4444]/15 text-[#B91C1C]" },
];
const STATUS = {
  open: { l: "Ouvert", cls: "bg-[#3BA4FF]/15 text-[#1D70B8]" },
  in_progress: { l: "En cours", cls: "bg-[#F59E0B]/15 text-[#B45309]" },
  waiting: { l: "En attente", cls: "bg-[#8B5CF6]/15 text-[#5B21B6]" },
  resolved: { l: "Résolu", cls: "bg-[#10B981]/15 text-[#047857]" },
  closed: { l: "Fermé", cls: "bg-[#94A3B8]/15 text-[#475569]" },
};

// ─────────────────────────────────────────────────────────────
// EMPLOYEE LIST /support
// ─────────────────────────────────────────────────────────────
export default function SupportITList() {
  const { me } = useApp();
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [showNew, setShowNew] = useState(false);
  const navigate = useNavigate();
  const load = async () => {
    const { data } = await api.get("/tickets");
    setItems(data);
  };
  useEffect(() => { load(); }, []);

  const filtered = items.filter((t) => {
    if (status !== "all" && t.status !== status) return false;
    if (q && !((t.subject || "") + t.number).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-5 ms-fade-up">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="ms-overline">Support & IT › Support Informatique</div>
          <div className="mt-1 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#3BA4FF]/10 text-[#3BA4FF]"><LifeBuoy className="h-5 w-5" /></div>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-[#071B34]">Support Informatique</h1>
              <p className="text-sm text-[#475569] mt-0.5">Créez et suivez vos demandes d&apos;assistance IT</p>
            </div>
          </div>
        </div>
        <button onClick={() => setShowNew(true)} data-testid="ticket-create" className="ms-btn-primary"><Plus className="h-4 w-4" /> Nouveau ticket</button>
      </div>

      <div className="ms-card p-3 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[220px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un ticket…" className="ms-input pl-9" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="ms-input max-w-[200px]">
          <option value="all">Tous statuts</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.l}</option>)}
        </select>
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && <div className="ms-card p-10 text-center text-sm text-[#475569]">Aucun ticket.</div>}
        {filtered.map((t) => {
          const cat = CATEGORIES.find((c) => c.k === t.category);
          const prio = PRIORITIES.find((p) => p.k === t.priority);
          return (
            <button
              key={t.id}
              onClick={() => navigate(`/support/tickets/${t.id}`)}
              data-testid={`ticket-${t.id}`}
              className="ms-card p-4 flex items-center gap-4 w-full text-left hover:shadow-md transition-shadow"
            >
              <div className="h-10 w-10 rounded-xl bg-[#3BA4FF]/10 text-[#3BA4FF] flex items-center justify-center">
                {cat?.ic ? <cat.ic className="h-5 w-5" /> : <LifeBuoy className="h-5 w-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-[#94A3B8]">{t.number}</span>
                  <span className={`ms-chip !text-[10px] ${STATUS[t.status]?.cls}`}>{STATUS[t.status]?.l}</span>
                  <span className={`ms-chip !text-[10px] ${prio?.cls}`}>{prio?.l}</span>
                </div>
                <div className="font-bold text-[#071B34] mt-0.5 truncate">{t.subject}</div>
                {me?.is_admin && t.employee_name && (
                  <div className="text-xs text-[#94A3B8]">Par {t.employee_name}</div>
                )}
                <div className="text-xs text-[#94A3B8]">Créé le {formatDateFr(t.created_at?.slice(0, 10))} · {(t.messages || []).length} message(s)</div>
              </div>
              <ChevronRight className="h-4 w-4 text-[#94A3B8]" />
            </button>
          );
        })}
      </div>

      {showNew && <TicketComposer onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); load(); }} />}
    </div>
  );
}

function TicketComposer({ onClose, onSaved }) {
  const [f, setF] = useState({ subject: "", category: "hardware", priority: "normal", description: "", attachment_url: "", attachment_name: "" });
  const upload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const fd = new FormData(); fd.append("file", file);
    const { data } = await api.post("/uploads", fd, { headers: { "Content-Type": "multipart/form-data" } });
    setF({ ...f, attachment_url: data.url, attachment_name: file.name });
  };
  const submit = async () => {
    if (!f.subject.trim() || !f.description.trim()) { toast.error("Sujet et description requis"); return; }
    await api.post("/tickets", f);
    toast.success("Ticket créé");
    onSaved();
  };
  return (
    <PortalModal>
    <div onClick={onClose} className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-[#071B34]">Nouveau ticket</h2>
          <button onClick={onClose} className="h-9 w-9 rounded-xl hover:bg-[#F4F7FA]"><X className="h-4 w-4 mx-auto" /></button>
        </div>
        <div><label className="ms-overline">Sujet *</label>
          <input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} data-testid="tk-subject" placeholder="Décrivez brièvement le problème" className="ms-input mt-1" /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="ms-overline">Catégorie</label>
            <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} className="ms-input mt-1">
              {CATEGORIES.map((c) => <option key={c.k} value={c.k}>{c.l}</option>)}
            </select></div>
          <div><label className="ms-overline">Priorité</label>
            <select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })} className="ms-input mt-1">
              {PRIORITIES.map((p) => <option key={p.k} value={p.k}>{p.l}</option>)}
            </select></div>
        </div>
        <div><label className="ms-overline">Description détaillée *</label>
          <textarea rows={5} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} data-testid="tk-description" className="ms-input mt-1" /></div>
        <div>
          <label className="ms-overline">Pièce jointe</label>
          <div className="mt-1 flex items-center gap-2">
            <label className="inline-flex items-center gap-1.5 rounded-lg bg-[#3BA4FF] text-white text-xs font-semibold px-3 py-1.5 cursor-pointer">
              <Paperclip className="h-3 w-3" /> Ajouter
              <input type="file" className="hidden" onChange={upload} />
            </label>
            {f.attachment_name && <span className="text-xs">{f.attachment_name}</span>}
          </div>
        </div>
        <div className="flex gap-2 justify-end pt-3 border-t border-[#071B34]/5">
          <button onClick={onClose} className="ms-btn-outline">Annuler</button>
          <button onClick={submit} data-testid="tk-submit" className="ms-btn-primary"><Send className="h-4 w-4" /> Créer le ticket</button>
        </div>
      </div>
    </div>
    </PortalModal>
  );
}

// ─────────────────────────────────────────────────────────────
// TICKET DETAIL /support/tickets/:id
// ─────────────────────────────────────────────────────────────
export function TicketDetail() {
  const { id } = useParams();
  const { me } = useApp();
  const [t, setT] = useState(null);
  const [msg, setMsg] = useState("");
  const load = async () => setT((await api.get(`/tickets/${id}`)).data);
  useEffect(() => { load(); }, [id]);

  const reply = async () => {
    if (!msg.trim()) return;
    await api.post(`/tickets/${id}/reply`, { message: msg });
    setMsg("");
    load();
  };
  const setStatus = async (s) => {
    await api.put(`/tickets/${id}/status`, { status: s });
    toast.success("Statut mis à jour");
    load();
  };

  if (!t) return <div className="ms-card p-10 animate-pulse h-96" />;
  const cat = CATEGORIES.find((c) => c.k === t.category);
  const prio = PRIORITIES.find((p) => p.k === t.priority);

  return (
    <div className="space-y-4 ms-fade-up max-w-4xl mx-auto">
      <Link to="/support" className="ms-btn-outline text-xs w-max"><ArrowLeft className="h-3 w-3" /> Retour</Link>

      <div className="ms-card p-6 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-xs font-bold text-[#94A3B8]">{t.number}</div>
            <h1 className="text-2xl font-bold text-[#071B34] mt-1">{t.subject}</h1>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className={`ms-chip !text-[10px] ${STATUS[t.status]?.cls}`}>{STATUS[t.status]?.l}</span>
              <span className={`ms-chip !text-[10px] ${prio?.cls}`}>{prio?.l}</span>
              <span className="ms-chip !text-[10px] bg-[#3BA4FF]/12 text-[#1D70B8]">{cat?.l}</span>
            </div>
          </div>
          {me?.is_admin && (
            <div>
              <label className="ms-overline">Changer le statut</label>
              <select value={t.status} onChange={(e) => setStatus(e.target.value)} className="ms-input mt-1 max-w-[200px]">
                {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.l}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="ms-card p-5 space-y-3">
        <h2 className="text-base font-bold text-[#071B34]">Conversation</h2>
        {(t.messages || []).map((m) => (
          <div key={m.id} className={`rounded-2xl p-4 ${m.is_admin ? "bg-[#3BA4FF]/10 ml-8" : "bg-[#F4F7FA] mr-8"}`}>
            <div className="flex items-center gap-2 text-xs mb-1">
              <span className="font-bold text-[#071B34]">{m.author_name || "Employé"}</span>
              {m.is_admin && <span className="ms-chip !text-[10px] bg-[#3BA4FF]/20 text-[#1D70B8]">Support IT</span>}
              <span className="text-[#94A3B8]">{formatDateFr(m.at?.slice(0, 10))}</span>
            </div>
            <p className="text-sm text-[#334155] whitespace-pre-wrap">{m.message}</p>
          </div>
        ))}
        {t.attachment_url && (
          <a href={absoluteUrl(t.attachment_url)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-xs text-[#3BA4FF] hover:underline">
            <Paperclip className="h-3 w-3" /> {t.attachment_name || "Pièce jointe"}
          </a>
        )}
      </div>

      {t.status !== "closed" && (
        <div className="ms-card p-4">
          <label className="ms-overline">Répondre</label>
          <textarea rows={3} value={msg} onChange={(e) => setMsg(e.target.value)} data-testid="tk-reply" className="ms-input mt-2" />
          <div className="flex gap-2 justify-end mt-2">
            <button onClick={reply} data-testid="tk-reply-send" className="ms-btn-primary"><Send className="h-4 w-4" /> Envoyer</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CENTRE D'AIDE /aide
// ─────────────────────────────────────────────────────────────
export function CentreAide() {
  const [articles, setArticles] = useState([]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [selected, setSelected] = useState(null);

  const load = async () => {
    const params = new URLSearchParams();
    if (cat !== "all") params.set("category", cat);
    if (q) params.set("q", q);
    const { data } = await api.get(`/help/articles?${params}`);
    setArticles(data);
  };
  useEffect(() => { load(); }, [cat, q]);

  const categories = useMemo(() => {
    const set = new Set(articles.map((a) => a.category));
    return Array.from(set);
  }, [articles]);

  return (
    <div className="space-y-5 ms-fade-up">
      <div>
        <div className="ms-overline">Support & IT › Centre d&apos;aide</div>
        <div className="mt-1 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#3BA4FF]/10 text-[#3BA4FF]"><HelpCircle className="h-5 w-5" /></div>
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-[#071B34]">Centre d&apos;aide</h1>
            <p className="text-sm text-[#475569] mt-0.5">Trouvez des réponses à vos questions courantes</p>
          </div>
        </div>
      </div>

      <div className="rounded-3xl bg-gradient-to-br from-[#EBF4FF] to-[#DBE7FF] p-8">
        <h2 className="text-xl font-bold text-[#071B34]">Comment pouvons-nous vous aider ?</h2>
        <div className="mt-4 relative max-w-xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} data-testid="help-search" placeholder="Rechercher dans l'aide…" className="ms-input pl-10 bg-white" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-5">
        <div className="ms-card p-4 space-y-1 h-max">
          <button onClick={() => setCat("all")} className={`w-full text-left px-3 py-2 rounded-lg text-sm ${cat === "all" ? "bg-[#3BA4FF]/10 text-[#1D70B8] font-semibold" : "text-[#334155] hover:bg-[#F4F7FA]"}`}>Toutes catégories</button>
          {categories.map((c) => (
            <button key={c} onClick={() => setCat(c)} className={`w-full text-left px-3 py-2 rounded-lg text-sm ${cat === c ? "bg-[#3BA4FF]/10 text-[#1D70B8] font-semibold" : "text-[#334155] hover:bg-[#F4F7FA]"}`}>{c}</button>
          ))}
        </div>
        <div className="space-y-2">
          {articles.length === 0 && <div className="ms-card p-10 text-center text-sm text-[#475569]">Aucun article trouvé.</div>}
          {articles.map((a) => (
            <div key={a.id} className="ms-card overflow-hidden" data-testid={`help-${a.id}`}>
              <button onClick={() => setSelected(selected === a.id ? null : a.id)} className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-[#F4F7FA]">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-[#94A3B8]">{a.category}</div>
                  <div className="font-bold text-[#071B34] mt-0.5">{a.title}</div>
                </div>
                <ChevronRight className={`h-4 w-4 text-[#94A3B8] transition-transform ${selected === a.id ? "rotate-90" : ""}`} />
              </button>
              {selected === a.id && (
                <div className="p-4 pt-0 text-sm text-[#334155] leading-relaxed border-t border-[#071B34]/5"
                     dangerouslySetInnerHTML={{ __html: a.content.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>") }} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
