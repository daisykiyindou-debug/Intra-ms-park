import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Mail, Search, SlidersHorizontal, Bell, Bookmark, Plus, ArrowLeft, Clock,
  Paperclip, Archive, MoreVertical, Save, X, Edit3, Trash2, Send, Copy,
} from "lucide-react";
import { toast } from "sonner";
import { api, formatDateFr } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";
import RichTextEditor from "@/components/RichTextEditor";

const CATEGORIES = ["Général", "RH", "Événement", "Projet", "Procédure", "Ouverture"];

export default function NewslettersList() {
  const { me } = useApp();
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [tab, setTab] = useState("published"); // published | archived
  const navigate = useNavigate();
  const isEditor = me?.is_admin || me?.can_manage_communication;

  const load = async () => {
    const params = new URLSearchParams({ archived: tab === "archived" });
    if (category !== "all") params.set("category", category);
    if (q) params.set("q", q);
    const { data } = await api.get(`/newsletters?${params}`);
    setItems(data);
  };
  useEffect(() => { load(); }, [tab, category, q]); // eslint-disable-line

  return (
    <div className="space-y-5 ms-fade-up">
      {/* Breadcrumb + title */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="ms-overline flex items-center gap-1">Accueil › Communication interne › Newsletters</div>
          <div className="mt-1 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#3BA4FF]/10 text-[#3BA4FF]">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[#071B34]">Newsletters</h1>
              <p className="text-sm text-[#475569] mt-0.5">Retrouvez toutes les newsletters de MS Park</p>
            </div>
          </div>
        </div>
        {isEditor && (
          <button onClick={() => navigate("/newsletters/new")} data-testid="newsletter-create" className="ms-btn-primary">
            <Plus className="h-4 w-4" /> Nouvelle newsletter
          </button>
        )}
      </div>

      {/* Hero banner */}
      <div className="rounded-3xl bg-gradient-to-br from-[#EBF4FF] to-[#DBE7FF] p-8 flex items-center justify-between gap-6">
        <div className="flex-1">
          <h2 className="text-2xl md:text-3xl font-bold text-[#071B34]">Restez informé, restez connecté !</h2>
          <p className="text-sm text-[#475569] mt-2 max-w-md">
            Nos newsletters vous informent sur l'actualité de l'entreprise, les projets en cours,
            les événements à venir et bien plus encore.
          </p>
        </div>
        <div className="rounded-2xl bg-white p-4 max-w-xs">
          <div className="flex items-center gap-2 text-[#071B34]">
            <Bell className="h-4 w-4" />
            <span className="text-sm font-bold">Ne manquez aucune newsletter</span>
          </div>
          <p className="text-xs text-[#475569] mt-1">Activez les notifications pour être prévenu dès qu'une nouvelle newsletter est publiée.</p>
          <button className="mt-3 w-full rounded-xl bg-[#071B34] text-white text-sm font-semibold px-4 py-2">
            Activer les notifications
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="ms-card p-3 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[220px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            data-testid="nl-search"
            placeholder="Rechercher une newsletter…"
            className="ms-input pl-9"
          />
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value)} data-testid="nl-cat" className="ms-input max-w-[200px]">
          <option value="all">Toutes catégories</option>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <div className="flex rounded-xl bg-[#F4F7FA] p-1">
          {[["published", "Publiées"], ["archived", "Archivées"]].map(([k, l]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              data-testid={`nl-tab-${k}`}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${tab === k ? "bg-white shadow" : "text-[#475569]"}`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold text-[#071B34]">Toutes les newsletters</span>
          <span className="ms-chip !text-[10px]">{items.length}</span>
        </div>
        {items.length === 0 && (
          <div className="ms-card p-8 text-center text-sm text-[#475569]">Aucune newsletter dans cette catégorie.</div>
        )}
        {items.map((n) => <NewsletterCard key={n.id} nl={n} isEditor={isEditor} onChange={load} />)}
      </div>
    </div>
  );
}

function NewsletterCard({ nl, isEditor, onChange }) {
  const navigate = useNavigate();
  const isNew = nl.published_at && (Date.now() - new Date(nl.published_at).getTime()) < 7 * 24 * 3600 * 1000;
  const [menu, setMenu] = useState(false);
  return (
    <div className="ms-card overflow-hidden hover:shadow-md transition-shadow flex" data-testid={`nl-${nl.id}`}>
      <div
        className="w-56 shrink-0 bg-cover bg-center flex flex-col justify-end p-4 text-white"
        style={{
          backgroundImage: nl.cover_image
            ? `linear-gradient(180deg, rgba(7,27,52,0.15) 0%, rgba(7,27,52,0.85) 100%), url(${nl.cover_image})`
            : "linear-gradient(135deg, #0B2545, #3BA4FF)",
        }}
      >
        <div className="text-[10px] uppercase tracking-widest opacity-80">{nl.category}</div>
        <div className="text-2xl font-bold leading-tight mt-1 line-clamp-2">{nl.title}</div>
      </div>
      <div className="flex-1 p-4 flex flex-col md:flex-row gap-3 items-start md:items-center min-w-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-[#071B34] truncate">{nl.title}</h3>
            {isNew && <span className="ms-chip bg-[#10B981]/15 text-[#047857] !text-[10px]">Nouveau</span>}
            {nl.archived && <span className="ms-chip bg-[#94A3B8]/15 text-[#475569] !text-[10px]">Archivée</span>}
          </div>
          <div className="text-xs text-[#475569] mt-1">
            📅 Publié le {nl.published_at ? formatDateFr(nl.published_at.slice(0, 10)) : "—"} · {nl.reading_time || 3} min de lecture
          </div>
          <p className="text-sm text-[#475569] mt-2 line-clamp-2">{nl.preheader || nl.subject}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => navigate(`/newsletters/${nl.id}`)}
            data-testid={`nl-read-${nl.id}`}
            className="rounded-xl bg-[#071B34] text-white text-sm font-semibold px-4 py-2 hover:bg-[#0B2545]"
          >
            Lire la newsletter
          </button>
          <button className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[#071B34]/5"><Bookmark className="h-4 w-4" /></button>
          {isEditor && (
            <div className="relative">
              <button onClick={() => setMenu((v) => !v)} data-testid={`nl-menu-${nl.id}`} className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[#071B34]/5">
                <MoreVertical className="h-4 w-4" />
              </button>
              {menu && (
                <div className="absolute right-0 top-full mt-1 z-30 w-44 rounded-xl bg-white shadow-xl border border-[#071B34]/5 py-1 text-sm">
                  <button onClick={() => { setMenu(false); navigate(`/newsletters/${nl.id}/edit`); }} className="w-full text-left px-3 py-2 hover:bg-[#F4F7FA] flex items-center gap-2"><Edit3 className="h-3.5 w-3.5" /> Modifier</button>
                  {!nl.archived && (
                    <button onClick={async () => { setMenu(false); await api.post(`/admin/newsletters/${nl.id}/archive`); toast.success("Archivée"); onChange(); }} className="w-full text-left px-3 py-2 hover:bg-[#F4F7FA] flex items-center gap-2"><Archive className="h-3.5 w-3.5" /> Archiver</button>
                  )}
                  <button onClick={async () => {
                    if (!window.confirm("Supprimer cette newsletter ?")) return;
                    setMenu(false);
                    await api.delete(`/admin/newsletters/${nl.id}`);
                    toast.success("Supprimée"); onChange();
                  }} className="w-full text-left px-3 py-2 hover:bg-[#FEE2E2] text-[#B91C1C] flex items-center gap-2"><Trash2 className="h-3.5 w-3.5" /> Supprimer</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Detail page
export function NewsletterDetail() {
  const { id } = useParams();
  const [nl, setNl] = useState(null);
  useEffect(() => { api.get(`/newsletters/${id}`).then((r) => setNl(r.data)); }, [id]);
  if (!nl) return <div className="ms-card p-10 animate-pulse h-96" />;
  return (
    <div className="space-y-5 ms-fade-up max-w-4xl mx-auto">
      <Link to="/newsletters" className="ms-btn-outline text-xs w-max"><ArrowLeft className="h-3 w-3" /> Retour</Link>
      <div
        className="relative rounded-3xl overflow-hidden bg-[#071B34] text-white p-10 min-h-[280px] flex flex-col justify-end"
        style={{ backgroundImage: nl.cover_image ? `linear-gradient(180deg, rgba(7,27,52,0.15), rgba(7,27,52,0.9)), url(${nl.cover_image})` : undefined, backgroundSize: "cover", backgroundPosition: "center" }}
      >
        <div className="text-[10px] uppercase tracking-widest opacity-80">Newsletter interne · {nl.category}</div>
        <h1 className="mt-2 text-4xl md:text-5xl font-bold tracking-tight">{nl.title}</h1>
        {nl.subject && <p className="mt-3 text-lg opacity-90">{nl.subject}</p>}
        <div className="mt-4 flex items-center gap-4 text-xs opacity-80">
          <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {nl.reading_time || 3} min</span>
          <span>Publié le {nl.published_at ? formatDateFr(nl.published_at.slice(0, 10)) : "—"}</span>
        </div>
      </div>
      <div className="ms-card p-8 prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: nl.body_html || "<p class='text-[#475569] italic'>Aucun contenu.</p>" }} />
      {(nl.attachments || []).length > 0 && (
        <div className="ms-card p-6">
          <div className="ms-overline mb-3"><Paperclip className="h-3 w-3 inline mr-1" /> Pièces jointes</div>
          <div className="space-y-2">
            {nl.attachments.map((a, i) => (
              <a key={i} href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl bg-[#F4F7FA] p-3 hover:bg-[#3BA4FF]/10">
                <Paperclip className="h-4 w-4 text-[#3BA4FF]" />
                <span className="text-sm text-[#071B34] font-semibold">{a.name}</span>
              </a>
            ))}
          </div>
        </div>
      )}
      {/* Footer */}
      <div className="rounded-2xl bg-[#071B34] text-white p-6 text-center">
        <div className="text-lg font-bold">MS Park</div>
        <div className="text-xs opacity-70 mt-1">© {new Date().getFullYear()} · Communication interne</div>
      </div>
    </div>
  );
}

// ─── Editor page
export function NewsletterEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id || id === "new";
  const [f, setF] = useState({
    title: "", subject: "", preheader: "", cover_image: "", category: "Général",
    reading_time: 3, body_html: "", attachments: [], archived: false, published: false,
  });
  const [loading, setLoading] = useState(!isNew);

  useEffect(() => {
    if (!isNew) {
      api.get(`/newsletters/${id}`).then((r) => { setF(r.data); setLoading(false); });
    }
  }, [id, isNew]);

  const save = async (publish = false) => {
    const payload = { ...f, published: publish || f.published };
    try {
      if (isNew) {
        const { data } = await api.post("/admin/newsletters", payload);
        toast.success(publish ? "Newsletter publiée" : "Brouillon enregistré");
        navigate(`/newsletters/${data.id}/edit`, { replace: true });
      } else {
        await api.put(`/admin/newsletters/${id}`, payload);
        toast.success(publish ? "Newsletter publiée" : "Enregistré");
        if (publish) navigate("/newsletters");
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Erreur");
    }
  };

  const uploadImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    const { data } = await api.post("/uploads", fd, { headers: { "Content-Type": "multipart/form-data" } });
    setF((s) => ({ ...s, cover_image: data.url }));
    toast.success("Image de couverture ajoutée");
  };

  const addAttachment = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    const { data } = await api.post("/uploads", fd, { headers: { "Content-Type": "multipart/form-data" } });
    setF((s) => ({ ...s, attachments: [...(s.attachments || []), { name: file.name, url: data.url }] }));
    toast.success("Pièce jointe ajoutée");
  };

  if (loading) return <div className="ms-card p-10 animate-pulse h-96" />;

  return (
    <div className="space-y-5 ms-fade-up max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <Link to="/newsletters" className="ms-btn-outline text-xs"><ArrowLeft className="h-3 w-3" /> Retour</Link>
        <div className="flex gap-2">
          <button onClick={() => save(false)} data-testid="nl-save-draft" className="ms-btn-outline"><Save className="h-4 w-4" /> Enregistrer le brouillon</button>
          <button onClick={() => save(true)} data-testid="nl-publish" className="ms-btn-primary"><Send className="h-4 w-4" /> Publier</button>
        </div>
      </div>

      <div className="ms-card p-5 space-y-4">
        <h2 className="text-lg font-bold text-[#071B34]">Informations générales</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="ms-overline">Titre interne</label>
            <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} data-testid="nl-title" placeholder="Newsletter Juillet 2026" className="ms-input mt-2" />
          </div>
          <div>
            <label className="ms-overline">Catégorie</label>
            <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} data-testid="nl-category" className="ms-input mt-2">
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="ms-overline">Objet</label>
            <input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} data-testid="nl-subject" placeholder="Votre actu interne" className="ms-input mt-2" />
          </div>
          <div>
            <label className="ms-overline">Temps de lecture (min)</label>
            <input type="number" min={1} value={f.reading_time} onChange={(e) => setF({ ...f, reading_time: parseInt(e.target.value) || 3 })} className="ms-input mt-2" />
          </div>
          <div className="md:col-span-2">
            <label className="ms-overline">Préheader (aperçu boîte mail)</label>
            <input value={f.preheader} onChange={(e) => setF({ ...f, preheader: e.target.value })} data-testid="nl-preheader" placeholder="L'actu du mois, pour avancer ensemble" className="ms-input mt-2" />
          </div>
        </div>
      </div>

      <div className="ms-card p-5 space-y-3">
        <h2 className="text-lg font-bold text-[#071B34]">Image de couverture</h2>
        {f.cover_image && (
          <img src={f.cover_image} alt="" className="w-full h-56 object-cover rounded-2xl" />
        )}
        <label className="inline-flex items-center gap-1.5 rounded-lg bg-[#3BA4FF] text-white text-xs font-semibold px-3 py-1.5 cursor-pointer hover:bg-[#1D70B8] w-max">
          <Copy className="h-3 w-3" /> {f.cover_image ? "Remplacer" : "Ajouter"} une image
          <input type="file" accept="image/*" data-testid="nl-cover" className="hidden" onChange={uploadImage} />
        </label>
      </div>

      <div className="ms-card p-5">
        <h2 className="text-lg font-bold text-[#071B34] mb-3">Contenu principal</h2>
        <RichTextEditor
          value={f.body_html}
          onChange={(v) => setF({ ...f, body_html: v })}
          placeholder="Rédigez votre newsletter avec titres, images, boutons, listes…"
        />
      </div>

      <div className="ms-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-[#071B34]">Pièces jointes</h2>
          <label className="inline-flex items-center gap-1.5 rounded-lg bg-[#3BA4FF] text-white text-xs font-semibold px-3 py-1.5 cursor-pointer hover:bg-[#1D70B8]">
            <Paperclip className="h-3 w-3" /> Ajouter
            <input type="file" data-testid="nl-attachment" className="hidden" onChange={addAttachment} />
          </label>
        </div>
        <div className="mt-3 space-y-2">
          {(f.attachments || []).map((a, i) => (
            <div key={i} className="flex items-center gap-2 rounded-xl bg-[#F4F7FA] p-3">
              <Paperclip className="h-4 w-4 text-[#3BA4FF]" />
              <span className="flex-1 text-sm truncate">{a.name}</span>
              <button onClick={() => setF({ ...f, attachments: f.attachments.filter((_, j) => j !== i) })} className="text-[#B91C1C]">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {(f.attachments || []).length === 0 && (
            <p className="text-xs text-[#475569] italic">Aucune pièce jointe.</p>
          )}
        </div>
      </div>
    </div>
  );
}
