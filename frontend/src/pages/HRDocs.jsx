import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  FileText, ArrowLeft, Save, Send, Upload, X, Image as ImageIcon,
  Users, Calendar, Bell, Download, Printer, Eye, Trash2, Edit3, Plus,
} from "lucide-react";
import { toast } from "sonner";
import { api, absoluteUrl, formatDateFr } from "@/lib/api";
import RichTextEditor from "@/components/RichTextEditor";
import { useApp } from "@/contexts/AppContext";

const CATEGORIES = ["Ressources Humaines", "Informatique", "Sécurité", "Communication", "Juridique", "Formations", "Intégration", "Opérations"];
const DOC_TYPES = ["Procédure", "Politique", "Note interne", "Lettre", "Circulaire", "Guide"];

// ─────────────────────────────────────────────────────────────
// LIST (Management admin) — /management/documents-editor
// ─────────────────────────────────────────────────────────────
export function HRDocsManager() {
  const [items, setItems] = useState([]);
  const navigate = useNavigate();
  const load = async () => {
    const { data } = await api.get("/hr-documents");
    // admin sees all incl. drafts
    setItems(data);
  };
  useEffect(() => { load(); }, []);

  const del = async (id) => {
    if (!window.confirm("Supprimer ce document ?")) return;
    await api.delete(`/admin/hr-documents/${id}`);
    toast.success("Supprimé");
    load();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="ms-overline">Accueil › Administration › Documents</div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[#071B34] mt-1">Documents & lettres</h1>
          <p className="text-sm text-[#475569] mt-1">Créez, éditez et publiez des documents pour vos collaborateurs.</p>
        </div>
        <button onClick={() => navigate("/management/documents-editor/new")} data-testid="hrdoc-create" className="ms-btn-primary">
          <Plus className="h-4 w-4" /> Rédiger un document
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.length === 0 && (
          <div className="ms-card col-span-full p-10 text-center text-sm text-[#475569]">Aucun document. Cliquez sur &quot;Rédiger un document&quot; pour créer le premier.</div>
        )}
        {items.map((d) => (
          <div key={d.id} className="ms-card p-4 space-y-2" data-testid={`hrdoc-${d.id}`}>
            <div className="flex items-start justify-between gap-2">
              <span className="ms-chip !text-[10px] bg-[#3BA4FF]/12 text-[#1D70B8]">{d.category}</span>
              <div className="flex gap-1">
                {!d.published && <span className="ms-chip !text-[10px] bg-[#F59E0B]/15 text-[#B45309]">Brouillon</span>}
                {d.important && <span className="ms-chip !text-[10px] bg-[#EF4444]/15 text-[#B91C1C]">Important</span>}
              </div>
            </div>
            <h3 className="text-base font-bold text-[#071B34] line-clamp-2">{d.title}</h3>
            <p className="text-xs text-[#475569] line-clamp-2">{d.summary}</p>
            <div className="text-[10px] text-[#94A3B8]">
              {d.doc_type} · {d.published_at ? formatDateFr(d.published_at.slice(0, 10)) : "—"}
            </div>
            <div className="flex gap-2 pt-2 border-t border-[#071B34]/5">
              <Link to={`/documents/rediger/${d.id}`} className="flex-1 text-xs rounded-lg bg-[#F4F7FA] hover:bg-[#3BA4FF]/10 px-2 py-1.5 text-center inline-flex items-center justify-center gap-1"><Eye className="h-3 w-3" /> Voir</Link>
              <button onClick={() => navigate(`/management/documents-editor/${d.id}`)} className="flex-1 text-xs rounded-lg bg-[#F4F7FA] hover:bg-[#3BA4FF]/10 px-2 py-1.5 inline-flex items-center justify-center gap-1"><Edit3 className="h-3 w-3" /> Modifier</button>
              <button onClick={() => del(d.id)} className="text-xs rounded-lg hover:bg-[#FEE2E2] text-[#B91C1C] px-2 py-1.5"><Trash2 className="h-3 w-3" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// EDITOR — /management/documents-editor/new or /:id
// ─────────────────────────────────────────────────────────────
export function HRDocEditor() {
  const { id } = useParams();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const [f, setF] = useState({
    title: "", category: "Ressources Humaines", subcategory: "", doc_type: "Procédure",
    summary: "", body_html: "", header_logo: "", footer_text: "MS Park · Ressources Humaines",
    visibility: "all", group_targets: [], employee_targets: [], important: false,
    allow_download: true, allow_print: true, track_reads: false, published: false, expires_at: "",
  });
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(!isNew);

  useEffect(() => {
    api.get("/employees").then((r) => setEmployees(r.data));
    if (!isNew) api.get(`/hr-documents/${id}`).then((r) => { setF(r.data); setLoading(false); });
  }, [id, isNew]);

  const save = async (publish = false) => {
    if (!f.title.trim()) { toast.error("Titre requis"); return; }
    const payload = { ...f, published: publish || f.published };
    try {
      if (isNew) {
        const { data } = await api.post("/admin/hr-documents", payload);
        toast.success(publish ? "Publié" : "Brouillon enregistré");
        navigate(`/management/documents-editor/${data.id}`, { replace: true });
      } else {
        await api.put(`/admin/hr-documents/${id}`, payload);
        toast.success(publish ? "Publié" : "Enregistré");
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Erreur");
    }
  };

  const uploadLogo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    const { data } = await api.post("/uploads", fd, { headers: { "Content-Type": "multipart/form-data" } });
    setF((s) => ({ ...s, header_logo: data.url }));
    toast.success("Logo ajouté");
  };

  if (loading) return <div className="ms-card p-10 animate-pulse h-96" />;

  return (
    <div className="space-y-4 ms-fade-up">
      <div className="ms-card p-3 flex items-center justify-between gap-3 flex-wrap sticky top-0 z-20">
        <Link to="/management/documents-editor" className="ms-btn-outline text-xs"><ArrowLeft className="h-3 w-3" /> Retour</Link>
        <div className="flex-1 text-center text-sm font-semibold text-[#071B34] truncate">
          {f.title || "Rédiger un document"}
        </div>
        <div className="flex gap-2">
          <button onClick={() => save(false)} data-testid="hrdoc-save-draft" className="ms-btn-outline"><Save className="h-4 w-4" /> Brouillon</button>
          <button onClick={() => save(true)} data-testid="hrdoc-publish" className="ms-btn-primary"><Send className="h-4 w-4" /> Publier</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <div className="space-y-4">
          <div className="ms-card p-5 space-y-4">
            <h2 className="text-lg font-bold text-[#071B34]">1. Informations générales</h2>
            <div>
              <label className="ms-overline">Titre du document *</label>
              <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} data-testid="hrdoc-title" placeholder="Procédure d'accueil des nouveaux collaborateurs" className="ms-input mt-1" />
              <div className="text-[10px] text-right text-[#94A3B8]">{f.title.length}/150</div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="ms-overline">Catégorie *</label>
                <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} className="ms-input mt-1">{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
              </div>
              <div>
                <label className="ms-overline">Sous-catégorie</label>
                <input value={f.subcategory} onChange={(e) => setF({ ...f, subcategory: e.target.value })} placeholder="Intégration" className="ms-input mt-1" />
              </div>
              <div>
                <label className="ms-overline">Type de document *</label>
                <select value={f.doc_type} onChange={(e) => setF({ ...f, doc_type: e.target.value })} className="ms-input mt-1">{DOC_TYPES.map((c) => <option key={c}>{c}</option>)}</select>
              </div>
            </div>
            <div>
              <label className="ms-overline">Résumé (facultatif)</label>
              <textarea rows={3} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} maxLength={300} className="ms-input mt-1" />
              <div className="text-[10px] text-right text-[#94A3B8]">{f.summary.length}/300</div>
            </div>
          </div>

          <div className="ms-card p-5 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-lg font-bold text-[#071B34]">2. En-tête & pied de page</h2>
            </div>
            <div>
              <label className="ms-overline">Logo (en-tête)</label>
              <div className="mt-1 flex items-center gap-3">
                {f.header_logo && <img src={absoluteUrl(f.header_logo)} alt="" className="h-14 w-auto rounded-lg" />}
                <label className="inline-flex items-center gap-1.5 rounded-lg bg-[#3BA4FF] text-white text-xs font-semibold px-3 py-1.5 cursor-pointer">
                  <ImageIcon className="h-3 w-3" /> {f.header_logo ? "Remplacer" : "Ajouter"} le logo
                  <input type="file" accept="image/*" className="hidden" onChange={uploadLogo} />
                </label>
                {f.header_logo && <button onClick={() => setF({ ...f, header_logo: "" })} className="text-xs text-[#B91C1C]">Retirer</button>}
              </div>
            </div>
            <div>
              <label className="ms-overline">Pied de page</label>
              <input value={f.footer_text} onChange={(e) => setF({ ...f, footer_text: e.target.value })} placeholder="MS Park · Ressources Humaines" className="ms-input mt-1" />
            </div>
          </div>

          <div className="ms-card p-5">
            <h2 className="text-lg font-bold text-[#071B34] mb-3">3. Contenu du document</h2>
            <div className="rounded-2xl border border-[#071B34]/10 bg-white p-4">
              {f.header_logo && <img src={absoluteUrl(f.header_logo)} alt="" className="h-16 w-auto mb-3" />}
              <RichTextEditor value={f.body_html} onChange={(v) => setF({ ...f, body_html: v })} placeholder="Rédigez votre contenu ici…" />
              {f.footer_text && <div className="text-[10px] text-[#94A3B8] mt-3 pt-3 border-t border-[#071B34]/5 text-center">{f.footer_text}</div>}
            </div>
          </div>
        </div>

        <div className="space-y-4 lg:sticky lg:top-24 h-max">
          <div className="ms-card p-5 space-y-3">
            <h2 className="text-base font-bold text-[#071B34]">4. Publication</h2>
            <div>
              <label className="ms-overline">Visibilité *</label>
              <div className="mt-2 space-y-2">
                {[
                  { k: "all", l: "Tous les employés", d: "Visible par l'ensemble des collaborateurs" },
                  { k: "groups", l: "Groupes spécifiques", d: "Choisir un ou plusieurs groupes" },
                  { k: "employees", l: "Utilisateurs spécifiques", d: "Choisir des employés" },
                ].map((o) => (
                  <label key={o.k} className={`flex items-start gap-2 rounded-xl p-2 cursor-pointer ${f.visibility === o.k ? "bg-[#3BA4FF]/10" : ""}`}>
                    <input type="radio" checked={f.visibility === o.k} onChange={() => setF({ ...f, visibility: o.k })} className="mt-1" />
                    <div>
                      <div className="text-sm font-semibold text-[#071B34]">{o.l}</div>
                      <div className="text-[10px] text-[#475569]">{o.d}</div>
                    </div>
                  </label>
                ))}
              </div>
              {f.visibility === "groups" && (
                <select multiple value={f.group_targets} onChange={(e) => setF({ ...f, group_targets: Array.from(e.target.selectedOptions).map((o) => o.value) })} className="ms-input mt-2 h-24">
                  {["restauration", "ops", "encadrement", "admin"].map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              )}
              {f.visibility === "employees" && (
                <select multiple value={f.employee_targets} onChange={(e) => setF({ ...f, employee_targets: Array.from(e.target.selectedOptions).map((o) => o.value) })} className="ms-input mt-2 h-32">
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
                </select>
              )}
            </div>
          </div>

          <div className="ms-card p-5 space-y-3">
            <h2 className="text-base font-bold text-[#071B34]">5. Options avancées</h2>
            {[
              { k: "important", l: "Document important", d: "Mettre en avant sur la page d'accueil" },
              { k: "allow_download", l: "Autoriser le téléchargement", d: "" },
              { k: "allow_print", l: "Autoriser l'impression", d: "" },
              { k: "track_reads", l: "Suivi des lectures", d: "Voir qui a lu le document" },
            ].map((o) => (
              <label key={o.k} className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm text-[#071B34]">{o.l}</div>
                  {o.d && <div className="text-[10px] text-[#475569]">{o.d}</div>}
                </div>
                <input type="checkbox" checked={!!f[o.k]} onChange={(e) => setF({ ...f, [o.k]: e.target.checked })} data-testid={`hrdoc-opt-${o.k}`} className="h-4 w-4" />
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PUBLIC VIEW — /documents/rediger/:id
// ─────────────────────────────────────────────────────────────
export function HRDocView() {
  const { id } = useParams();
  const [d, setD] = useState(null);
  useEffect(() => { api.get(`/hr-documents/${id}`).then((r) => setD(r.data)); }, [id]);
  if (!d) return <div className="ms-card p-10 animate-pulse h-96" />;
  return (
    <div className="max-w-4xl mx-auto space-y-4 ms-fade-up">
      <Link to="/documents" className="ms-btn-outline text-xs w-max"><ArrowLeft className="h-3 w-3" /> Retour aux documents</Link>
      <div className="ms-card p-10 space-y-6">
        {d.header_logo && <img src={absoluteUrl(d.header_logo)} alt="" className="h-20 w-auto" />}
        <div>
          <div className="ms-overline">{d.category} · {d.doc_type}</div>
          <h1 className="text-3xl md:text-4xl font-bold text-[#071B34] mt-2">{d.title}</h1>
          {d.summary && <p className="text-[#475569] mt-2">{d.summary}</p>}
        </div>
        <div className="ms-prose" dangerouslySetInnerHTML={{ __html: d.body_html }} />
        {d.footer_text && <div className="text-xs text-[#94A3B8] text-center pt-6 border-t border-[#071B34]/5">{d.footer_text}</div>}
      </div>
      {d.allow_download && (
        <button onClick={() => window.print()} className="ms-btn-outline"><Printer className="h-4 w-4" /> Imprimer / Télécharger PDF</button>
      )}
    </div>
  );
}
