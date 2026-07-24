import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  GraduationCap, Search, Plus, ArrowLeft, Users, Calendar, Clock, MapPin, X,
  CheckCircle2, Send, Trash2, Edit3,
} from "lucide-react";
import { toast } from "sonner";
import { api, absoluteUrl, formatDateFr } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";

const CATEGORIES = ["Métier", "Sécurité", "Bureautique", "Langues", "Management", "Autres"];
const FORMATS = ["présentiel", "distanciel", "hybride"];

export default function FormationsList() {
  const { me } = useApp();
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [proposeOpen, setProposeOpen] = useState(false);
  const navigate = useNavigate();
  const isAdmin = !!me?.is_admin;

  const load = async () => {
    const { data } = await api.get("/formations");
    setItems(data);
  };
  useEffect(() => { load(); }, []);

  const filtered = items.filter((f) => {
    if (cat !== "all" && f.category !== cat) return false;
    if (q && !((f.title || "") + (f.description || "")).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const register = async (f) => {
    if (f.me_registered) {
      await api.delete(`/formations/${f.id}/register`);
      toast.success("Inscription annulée");
    } else {
      await api.post(`/formations/${f.id}/register`);
      toast.success("Inscrit !");
    }
    load();
  };

  return (
    <div className="space-y-5 ms-fade-up">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="ms-overline">Accueil › Vie de l&apos;entreprise › Formation</div>
          <div className="mt-1 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#3BA4FF]/10 text-[#3BA4FF]"><GraduationCap className="h-5 w-5" /></div>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[#071B34]">Formation</h1>
              <p className="text-sm text-[#475569] mt-0.5">Développez vos compétences et proposez de nouvelles formations</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setProposeOpen(true)} data-testid="propose-formation" className="ms-btn-outline">
            <Send className="h-4 w-4" /> Proposer une formation
          </button>
          {isAdmin && (
            <button onClick={() => navigate("/management/formations")} className="ms-btn-primary">
              <Plus className="h-4 w-4" /> Gérer les formations
            </button>
          )}
        </div>
      </div>

      <div className="ms-card p-3 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[220px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une formation…" className="ms-input pl-9" />
        </div>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="ms-input max-w-[200px]">
          <option value="all">Toutes catégories</option>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.length === 0 && <div className="ms-card col-span-full p-10 text-center text-sm text-[#475569]">Aucune formation.</div>}
        {filtered.map((f) => (
          <div key={f.id} className="ms-card overflow-hidden flex flex-col" data-testid={`formation-${f.id}`}>
            <div
              className="h-32 bg-cover bg-center relative"
              style={{ backgroundImage: f.cover_image ? `url(${absoluteUrl(f.cover_image)})` : "linear-gradient(135deg, #0B2545, #3BA4FF)" }}
            >
              <div className="absolute inset-0 bg-gradient-to-t from-[#071B34]/60 to-transparent" />
              <div className="absolute top-3 left-3 flex gap-1">
                <span className="text-[10px] uppercase tracking-widest bg-white/95 text-[#071B34] px-2 py-0.5 rounded-full font-semibold">{f.category}</span>
                <span className="text-[10px] bg-[#3BA4FF]/95 text-white px-2 py-0.5 rounded-full font-semibold capitalize">{f.format}</span>
              </div>
            </div>
            <div className="p-4 flex flex-col flex-1">
              <h3 className="text-base font-bold text-[#071B34] line-clamp-2">{f.title}</h3>
              <p className="text-xs text-[#475569] mt-1 line-clamp-2">{f.description}</p>
              <div className="mt-3 space-y-1 text-xs text-[#475569]">
                <div className="flex items-center gap-1.5"><Clock className="h-3 w-3" /> {f.duration_hours}h de formation</div>
                {f.start_date && <div className="flex items-center gap-1.5"><Calendar className="h-3 w-3" /> {formatDateFr(f.start_date)}</div>}
                {f.location && <div className="flex items-center gap-1.5"><MapPin className="h-3 w-3" /> {f.location}</div>}
                <div className="flex items-center gap-1.5"><Users className="h-3 w-3" /> {f.registrations_count || 0}/{f.max_participants || "∞"} inscrits</div>
              </div>
              <button
                onClick={() => register(f)}
                disabled={!f.is_open}
                data-testid={`register-${f.id}`}
                className={`mt-3 w-full rounded-xl text-sm font-semibold py-2 transition-colors ${
                  f.me_registered
                    ? "bg-[#10B981]/15 text-[#047857]"
                    : "bg-[#3BA4FF] text-white hover:bg-[#2A8DE0]"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {f.me_registered ? <><CheckCircle2 className="h-4 w-4 inline mr-1" /> Inscrit — annuler</> : "S'inscrire"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {proposeOpen && <ProposeModal onClose={() => setProposeOpen(false)} onSaved={() => setProposeOpen(false)} />}
    </div>
  );
}

function ProposeModal({ onClose, onSaved }) {
  const [f, setF] = useState({ title: "", reason: "", expected_benefit: "", external_link: "" });
  const submit = async () => {
    if (!f.title.trim() || !f.reason.trim()) { toast.error("Titre et raison requis"); return; }
    await api.post("/formations/propose", f);
    toast.success("Proposition envoyée !");
    onSaved();
  };
  return (
    <div onClick={onClose} className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-3xl w-full max-w-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-[#071B34]">Proposer une formation</h2>
          <button onClick={onClose} className="h-9 w-9 rounded-xl hover:bg-[#F4F7FA]"><X className="h-4 w-4 mx-auto" /></button>
        </div>
        <div>
          <label className="ms-overline">Titre de la formation *</label>
          <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} data-testid="propose-title" placeholder="Ex : Photographie professionnelle" className="ms-input mt-1" />
        </div>
        <div>
          <label className="ms-overline">Pourquoi cette formation ? *</label>
          <textarea rows={3} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} data-testid="propose-reason" className="ms-input mt-1" />
        </div>
        <div>
          <label className="ms-overline">Bénéfice attendu pour MS Park</label>
          <textarea rows={2} value={f.expected_benefit} onChange={(e) => setF({ ...f, expected_benefit: e.target.value })} className="ms-input mt-1" />
        </div>
        <div>
          <label className="ms-overline">Lien externe (organisme)</label>
          <input value={f.external_link} onChange={(e) => setF({ ...f, external_link: e.target.value })} placeholder="https://" className="ms-input mt-1" />
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="ms-btn-outline">Annuler</button>
          <button onClick={submit} data-testid="propose-submit" className="ms-btn-primary"><Send className="h-4 w-4" /> Envoyer</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Admin manager
// ═══════════════════════════════════════════════════════════════════
export function FormationsManager() {
  const [items, setItems] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [editing, setEditing] = useState(null);
  const load = async () => {
    const [f, p] = await Promise.all([
      api.get("/formations").then((r) => r.data),
      api.get("/admin/formation-proposals").then((r) => r.data),
    ]);
    setItems(f); setProposals(p);
  };
  useEffect(() => { load(); }, []);

  const del = async (id) => {
    if (!window.confirm("Supprimer cette formation ?")) return;
    await api.delete(`/admin/formations/${id}`);
    toast.success("Supprimée");
    load();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="ms-overline">Accueil › Administration › Formations</div>
          <h1 className="text-3xl font-bold text-[#071B34] mt-1">Gestion des formations</h1>
        </div>
        <button onClick={() => setEditing({})} data-testid="admin-new-formation" className="ms-btn-primary">
          <Plus className="h-4 w-4" /> Nouvelle formation
        </button>
      </div>

      {proposals.length > 0 && (
        <div className="ms-card p-5">
          <h2 className="text-base font-bold text-[#071B34] mb-3">Propositions ({proposals.length})</h2>
          <div className="space-y-2">
            {proposals.map((p) => (
              <div key={p.id} className="rounded-xl bg-[#F4F7FA] p-3">
                <div className="flex items-center gap-2">
                  <span className="ms-chip !text-[10px] bg-[#F59E0B]/15 text-[#B45309]">{p.status}</span>
                  <span className="font-bold text-[#071B34]">{p.title}</span>
                </div>
                <div className="text-xs text-[#475569] mt-1">Par {p.employee_name} · {formatDateFr(p.created_at?.slice(0, 10))}</div>
                <p className="text-xs text-[#334155] mt-1">{p.reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((f) => (
          <div key={f.id} className="ms-card p-4 space-y-2">
            <div className="text-xs text-[#94A3B8]">{f.category} · {f.format}</div>
            <h3 className="font-bold text-[#071B34]">{f.title}</h3>
            <div className="text-xs text-[#475569]">{f.duration_hours}h · {f.registrations_count || 0} inscrits</div>
            <div className="flex gap-1 pt-2 border-t border-[#071B34]/5">
              <button onClick={() => setEditing(f)} className="flex-1 text-xs rounded-lg bg-[#F4F7FA] hover:bg-[#3BA4FF]/10 px-2 py-1.5 inline-flex items-center justify-center gap-1"><Edit3 className="h-3 w-3" /> Modifier</button>
              <button onClick={() => del(f.id)} className="text-xs rounded-lg hover:bg-[#FEE2E2] text-[#B91C1C] px-2 py-1.5"><Trash2 className="h-3 w-3" /></button>
            </div>
          </div>
        ))}
      </div>

      {editing && <FormationEditor formation={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function FormationEditor({ formation, onClose, onSaved }) {
  const isNew = !formation?.id;
  const [f, setF] = useState({
    title: formation?.title || "",
    description: formation?.description || "",
    category: formation?.category || "Métier",
    duration_hours: formation?.duration_hours || 8,
    format: formation?.format || "présentiel",
    location: formation?.location || "",
    start_date: formation?.start_date || "",
    end_date: formation?.end_date || "",
    trainer: formation?.trainer || "",
    max_participants: formation?.max_participants || 20,
    cover_image: formation?.cover_image || "",
    is_open: formation?.is_open ?? true,
  });

  const save = async () => {
    if (!f.title.trim()) { toast.error("Titre requis"); return; }
    if (isNew) await api.post("/admin/formations", f);
    else await api.put(`/admin/formations/${formation.id}`, f);
    toast.success("Enregistré");
    onSaved();
  };

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-3xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-[#071B34]">{isNew ? "Nouvelle formation" : "Modifier la formation"}</h2>
          <button onClick={onClose} className="h-9 w-9 rounded-xl hover:bg-[#F4F7FA]"><X className="h-4 w-4 mx-auto" /></button>
        </div>
        <div><label className="ms-overline">Titre *</label>
          <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className="ms-input mt-1" /></div>
        <div><label className="ms-overline">Description</label>
          <textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className="ms-input mt-1" /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="ms-overline">Catégorie</label>
            <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} className="ms-input mt-1">{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div><label className="ms-overline">Format</label>
            <select value={f.format} onChange={(e) => setF({ ...f, format: e.target.value })} className="ms-input mt-1">{FORMATS.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div><label className="ms-overline">Durée (heures)</label>
            <input type="number" value={f.duration_hours} onChange={(e) => setF({ ...f, duration_hours: parseInt(e.target.value) || 0 })} className="ms-input mt-1" /></div>
          <div><label className="ms-overline">Participants max</label>
            <input type="number" value={f.max_participants} onChange={(e) => setF({ ...f, max_participants: parseInt(e.target.value) || 0 })} className="ms-input mt-1" /></div>
          <div><label className="ms-overline">Date de début</label>
            <input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} className="ms-input mt-1" /></div>
          <div><label className="ms-overline">Date de fin</label>
            <input type="date" value={f.end_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} className="ms-input mt-1" /></div>
          <div><label className="ms-overline">Lieu</label>
            <input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} className="ms-input mt-1" /></div>
          <div><label className="ms-overline">Formateur</label>
            <input value={f.trainer} onChange={(e) => setF({ ...f, trainer: e.target.value })} className="ms-input mt-1" /></div>
        </div>
        <div><label className="ms-overline">Image de couverture (URL)</label>
          <input value={f.cover_image} onChange={(e) => setF({ ...f, cover_image: e.target.value })} className="ms-input mt-1" /></div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.is_open} onChange={(e) => setF({ ...f, is_open: e.target.checked })} />
          Inscriptions ouvertes
        </label>
        <div className="flex gap-2 justify-end pt-3 border-t border-[#071B34]/5">
          <button onClick={onClose} className="ms-btn-outline">Annuler</button>
          <button onClick={save} className="ms-btn-primary">Enregistrer</button>
        </div>
      </div>
    </div>
  );
}
