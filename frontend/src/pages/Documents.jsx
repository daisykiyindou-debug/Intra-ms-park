import { useMemo, useState, useEffect, useRef } from "react";
import { FileText, Download, Eye, Search, X, Receipt, Star, Upload, Plus, Edit3, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api, formatDateFr } from "@/lib/api";
import useLiveData from "@/hooks/useLiveData";
import PortalModal from "@/components/PortalModal";
import { useApp } from "@/contexts/AppContext";

const CATEGORIES = [
  { k: "all", l: "Toutes les catégories" },
  { k: "Paie", l: "Paie" },
  { k: "Contrats", l: "Contrats" },
  { k: "Règlements", l: "Règlements" },
  { k: "Sécurité", l: "Sécurité" },
  { k: "Planning", l: "Planning" },
  { k: "Attestations", l: "Attestations" },
  { k: "Ressources Humaines", l: "Ressources Humaines" },
];

const TABS = [
  { k: "all", l: "Tous les documents" },
  { k: "favorites", l: "Mes favoris" },
  { k: "recent", l: "Téléchargés récemment" },
];

export default function Documents() {
  const { me, adminMode, employees } = useApp();
  const isAdmin = !!me?.is_admin && adminMode !== false;
  const [docs, setDocs] = useState([]);
  const [hrDocs, setHrDocs] = useState([]);
  const [favIds, setFavIds] = useState(() => new Set(JSON.parse(localStorage.getItem("docFavs") || "[]")));
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("all");
  const [preview, setPreview] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editing, setEditing] = useState(null); // legacy doc being edited

  useLiveData(() => api.get("/documents").then((r) => setDocs(r.data)), ["documents"]);
  useEffect(() => { api.get("/hr-documents").then((r) => setHrDocs(r.data)); }, []);

  const reloadDocs = () => api.get("/documents").then((r) => setDocs(r.data));

  const deleteDoc = async (d) => {
    if (d.kind !== "file") return;
    if (!window.confirm(`Supprimer définitivement "${d.name}" ?`)) return;
    try {
      await api.delete(`/admin/documents/${d.id}`);
      toast.success("Document supprimé");
      reloadDocs();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Suppression impossible");
    }
  };

  const toggleFav = (id) => {
    const next = new Set(favIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setFavIds(next);
    localStorage.setItem("docFavs", JSON.stringify(Array.from(next)));
  };

  // Merge both sources into unified list
  const merged = useMemo(() => {
    const legacy = docs.map((d) => ({
      id: d.id, name: d.name, category: d.category, date: d.issued_at,
      size_kb: d.size_kb, kind: "file", url: d.url, raw: d,
    }));
    const rich = hrDocs.map((d) => ({
      id: d.id, name: d.title, category: d.category, date: d.published_at || d.created_at,
      size_kb: null, kind: "rich", link: `/documents/rediger/${d.id}`, raw: d,
    }));
    return [...legacy, ...rich];
  }, [docs, hrDocs]);

  const catCounts = useMemo(() => {
    const c = {};
    merged.forEach((d) => { c[d.category] = (c[d.category] || 0) + 1; });
    return c;
  }, [merged]);

  const filtered = useMemo(() => {
    return merged.filter((d) => {
      if (cat !== "all" && d.category !== cat) return false;
      if (q && !d.name.toLowerCase().includes(q.toLowerCase())) return false;
      if (tab === "favorites" && !favIds.has(d.id)) return false;
      return true;
    });
  }, [merged, cat, q, favIds, tab]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 ms-fade-up">
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="ms-overline">Accueil › Documents</div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[#071B34] mt-1">Documents</h1>
            <p className="text-sm text-[#475569] mt-1">Retrouvez et téléchargez tous les documents disponibles.</p>
          </div>
          {isAdmin && (
            <button
              onClick={() => setUploadOpen(true)}
              data-testid="doc-admin-upload"
              className="ms-btn-primary inline-flex items-center gap-2"
            >
              <Upload className="h-4 w-4" /> Uploader un PDF
            </button>
          )}
        </div>

        <div className="ms-card p-3 flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[220px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8]" />
            <input value={q} onChange={(e) => setQ(e.target.value)} data-testid="search-docs" placeholder="Rechercher un document…" className="ms-input pl-9" />
          </div>
          <select value={cat} onChange={(e) => setCat(e.target.value)} data-testid="cat-select" className="ms-input max-w-[220px]">
            {CATEGORIES.map((c) => <option key={c.k} value={c.k}>{c.l}</option>)}
          </select>
        </div>

        <div className="flex gap-1 border-b border-[#071B34]/10">
          {TABS.map((t) => (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              data-testid={`doc-tab-${t.k}`}
              className={`px-4 py-2.5 text-sm font-semibold transition-colors relative ${
                tab === t.k ? "text-[#3BA4FF]" : "text-[#475569] hover:text-[#071B34]"
              }`}
            >
              {t.l}
              {tab === t.k && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#3BA4FF]" />}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.length === 0 && (
            <div className="ms-card col-span-full p-12 text-center text-sm text-[#475569]">
              Aucun document trouvé.
            </div>
          )}
          {filtered.map((d) => (
            <DocCard
              key={d.id}
              d={d}
              isFav={favIds.has(d.id)}
              onFav={() => toggleFav(d.id)}
              onPreview={() => setPreview(d)}
              isAdmin={isAdmin}
              onEdit={() => setEditing(d)}
              onDelete={() => deleteDoc(d)}
            />
          ))}
        </div>
      </div>

      {/* Right side rails */}
      <div className="space-y-4 lg:sticky lg:top-24 h-max">
        <div className="ms-card p-5 space-y-3">
          <div className="ms-overline">Accès rapide</div>
          <button onClick={() => setTab("favorites")} className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-[#F4F7FA]">
            <span className="text-sm text-[#071B34] flex items-center gap-2"><Star className="h-4 w-4 text-[#F59E0B]" /> Mes favoris</span>
            <span className="ms-chip !text-[10px]">{favIds.size}</span>
          </button>
        </div>
        <div className="ms-card p-5 space-y-2">
          <div className="ms-overline mb-1">Catégories</div>
          {CATEGORIES.slice(1).map((c) => (
            <button key={c.k} onClick={() => setCat(c.k)} className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-[#F4F7FA] text-sm">
              <span className="text-[#334155]">{c.l}</span>
              <span className="text-xs text-[#94A3B8]">{catCounts[c.k] || 0}</span>
            </button>
          ))}
        </div>
      </div>

      {preview && (
        <PortalModal>
        <div role="dialog" aria-modal="true" onClick={() => setPreview(null)} className="fixed inset-0 z-50 bg-black/50 backdrop-blur-md flex items-center justify-center p-4">
          <div onClick={(e) => e.stopPropagation()} data-testid="doc-preview" className="bg-white rounded-2xl max-w-3xl w-full h-[80vh] p-0 overflow-hidden">
            <div className="flex items-center justify-between px-5 h-14 border-b border-[#071B34]/5">
              <h4 className="text-sm font-bold text-[#071B34]">{preview.name}</h4>
              <button onClick={() => setPreview(null)} className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[#071B34]/5"><X className="h-4 w-4" /></button>
            </div>
            <iframe title="preview" src={preview.url} className="w-full h-[calc(80vh-3.5rem)]" />
          </div>
        </div>
        </PortalModal>
      )}

      {uploadOpen && (
        <PortalModal>
          <UploadPdfModal
            employees={employees || []}
            onClose={() => setUploadOpen(false)}
            onDone={() => { setUploadOpen(false); reloadDocs(); }}
          />
        </PortalModal>
      )}

      {editing && (
        <PortalModal>
          <EditDocModal
            doc={editing}
            employees={employees || []}
            onClose={() => setEditing(null)}
            onDone={() => { setEditing(null); reloadDocs(); }}
          />
        </PortalModal>
      )}
    </div>
  );
}

function DocCard({ d, isFav, onFav, onPreview, isAdmin, onEdit, onDelete }) {
  const ext = (d.url || "").split(".").pop()?.toUpperCase() || (d.kind === "rich" ? "HTML" : "PDF");
  const colorForExt = {
    PDF: "bg-[#EF4444]", DOCX: "bg-[#3BA4FF]", DOC: "bg-[#3BA4FF]",
    XLSX: "bg-[#10B981]", XLS: "bg-[#10B981]", PPTX: "bg-[#F59E0B]", PPT: "bg-[#F59E0B]",
    HTML: "bg-[#8B5CF6]", ZIP: "bg-[#F59E0B]",
  }[ext] || "bg-[#3BA4FF]";
  // Only legacy uploaded files (kind === "file") can be edited/deleted here.
  // Payslips are auto-generated (target_employee_id set + is_payslip flag).
  const isPayslip = d.raw?.is_payslip;
  const canManage = isAdmin && d.kind === "file" && !isPayslip;
  return (
    <div className="ms-card p-4 space-y-2 hover:shadow-md transition-shadow" data-testid={`doc-${d.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className={`inline-flex items-center justify-center h-11 w-11 rounded-xl text-white font-bold text-[10px] ${colorForExt}`}>{ext}</div>
        <div className="flex items-center gap-1">
          {canManage && (
            <>
              <button
                onClick={onEdit}
                data-testid={`doc-edit-${d.id}`}
                title="Modifier le document"
                className="h-8 w-8 rounded-lg hover:bg-[#3BA4FF]/10 text-[#3BA4FF] inline-flex items-center justify-center"
              >
                <Edit3 className="h-4 w-4" />
              </button>
              <button
                onClick={onDelete}
                data-testid={`doc-del-${d.id}`}
                title="Supprimer le document"
                className="h-8 w-8 rounded-lg hover:bg-[#FEE2E2] text-[#B91C1C] inline-flex items-center justify-center"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          )}
          <button onClick={onFav} className={`h-8 w-8 rounded-lg ${isFav ? "text-[#F59E0B]" : "text-[#94A3B8]"} hover:bg-[#F4F7FA]`}>
            <Star className={`h-4 w-4 ${isFav ? "fill-[#F59E0B]" : ""}`} />
          </button>
        </div>
      </div>
      <span className="ms-chip !text-[10px]">{d.category}</span>
      <h3 className="text-sm font-bold text-[#071B34] line-clamp-2">{d.name}</h3>
      {d.raw?.summary && <p className="text-xs text-[#475569] line-clamp-2">{d.raw.summary}</p>}
      <div className="flex items-center justify-between text-[10px] text-[#94A3B8] pt-2 border-t border-[#071B34]/5">
        <span>{ext}{d.size_kb ? ` · ${d.size_kb} Ko` : ""}</span>
        <span>{d.date ? formatDateFr((d.date || "").slice(0, 10)) : ""}</span>
      </div>
      <div className="flex gap-1.5 pt-1">
        {d.kind === "rich" ? (
          <Link to={d.link} className="flex-1 text-xs rounded-lg bg-[#3BA4FF] hover:bg-[#2A8DE0] px-2 py-1.5 text-white text-center inline-flex items-center justify-center gap-1"><Eye className="h-3 w-3" /> Lire</Link>
        ) : d.raw?.is_payslip ? (
          <Link to={`/documents/payslip/${d.raw.target_employee_id}/${d.raw.payslip_year}/${d.raw.payslip_month}`} className="flex-1 text-xs rounded-lg bg-[#3BA4FF] hover:bg-[#2A8DE0] px-2 py-1.5 text-white text-center inline-flex items-center justify-center gap-1"><Receipt className="h-3 w-3" /> Voir la fiche</Link>
        ) : (
          <>
            <button onClick={onPreview} className="flex-1 text-xs rounded-lg bg-[#F4F7FA] hover:bg-[#071B34]/5 px-2 py-1.5 text-[#071B34] inline-flex items-center justify-center gap-1"><Eye className="h-3 w-3" /> Aperçu</button>
            <a href={d.url} target="_blank" rel="noreferrer" className="flex-1 text-xs rounded-lg bg-[#3BA4FF] hover:bg-[#2A8DE0] px-2 py-1.5 text-white inline-flex items-center justify-center gap-1"><Download className="h-3 w-3" /> Télécharger</a>
          </>
        )}
      </div>
    </div>
  );
}

function UploadPdfModal({ employees, onClose, onDone }) {
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Ressources Humaines");
  const [description, setDescription] = useState("");
  const [target, setTarget] = useState("all"); // all | <employee_id>
  const [empSearch, setEmpSearch] = useState("");
  const [busy, setBusy] = useState(false);

  const onPickFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.type && f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Seuls les fichiers PDF sont acceptés");
      e.target.value = "";
      return;
    }
    setFile(f);
    // Pre-fill the name with the file name minus extension
    if (!name.trim()) setName(f.name.replace(/\.pdf$/i, ""));
  };

  const submit = async () => {
    if (!file) { toast.error("Sélectionnez un fichier PDF"); return; }
    if (!name.trim()) { toast.error("Nom du document requis"); return; }
    setBusy(true);
    try {
      // 1) Upload the PDF
      const form = new FormData();
      form.append("file", file);
      const { data: up } = await api.post("/uploads", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      // 2) Register the document
      const size_kb = Math.max(1, Math.round((up.size || file.size || 0) / 1024));
      await api.post("/admin/documents", {
        name: name.trim(),
        category,
        url: up.url,
        target_employee_id: target === "all" ? "all" : target,
        description: description.trim() || null,
        size_kb,
      });
      toast.success("Document publié");
      onDone?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Impossible de publier le document");
    } finally {
      setBusy(false);
    }
  };

  const filteredEmp = (employees || [])
    .filter((e) => !e.is_super_admin)
    .filter((e) => {
      if (!empSearch.trim()) return true;
      const n = empSearch.toLowerCase();
      return `${e.first_name} ${e.last_name}`.toLowerCase().includes(n);
    });

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        data-testid="doc-upload-modal"
        className="bg-white rounded-3xl w-full max-w-lg max-h-[90vh] overflow-hidden shadow-2xl flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#071B34]/5">
          <div>
            <h3 className="text-base font-bold text-[#071B34]">Uploader un PDF</h3>
            <p className="text-xs text-[#475569] mt-0.5">Publier un document depuis vos fichiers.</p>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-lg hover:bg-[#F4F7FA] inline-flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Drop / pick zone */}
          <div>
            <label className="text-[10px] uppercase tracking-widest font-semibold text-[#475569]">
              Fichier PDF
            </label>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf"
              onChange={onPickFile}
              className="hidden"
              data-testid="doc-upload-input"
            />
            <button
              onClick={() => fileRef.current?.click()}
              className={`mt-1 w-full rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${
                file
                  ? "border-[#10B981]/40 bg-[#10B981]/5"
                  : "border-[#3BA4FF]/40 bg-[#3BA4FF]/5 hover:bg-[#3BA4FF]/10"
              }`}
            >
              {file ? (
                <div className="flex items-center justify-center gap-3 text-[#065F46]">
                  <FileText className="h-6 w-6" />
                  <div className="text-left">
                    <div className="text-sm font-semibold truncate max-w-[280px]">{file.name}</div>
                    <div className="text-[10px]">{Math.max(1, Math.round(file.size / 1024))} Ko · Cliquez pour changer</div>
                  </div>
                </div>
              ) : (
                <div className="text-[#1D70B8] flex flex-col items-center gap-2">
                  <Upload className="h-6 w-6" />
                  <div className="text-sm font-semibold">Choisir un PDF sur votre appareil</div>
                  <div className="text-[11px] text-[#475569]">Format .pdf uniquement · 8 Mo max</div>
                </div>
              )}
            </button>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-widest font-semibold text-[#475569]">Nom du document</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex : Note de service — juillet 2026"
              data-testid="doc-upload-name"
              className="ms-input mt-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-widest font-semibold text-[#475569]">Catégorie</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                data-testid="doc-upload-category"
                className="ms-input mt-1"
              >
                {CATEGORIES.filter((c) => c.k !== "all").map((c) => (
                  <option key={c.k} value={c.k}>{c.l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest font-semibold text-[#475569]">Destinataire</label>
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                data-testid="doc-upload-target"
                className="ms-input mt-1"
              >
                <option value="all">Tous les employés</option>
                <option value="__specific__" disabled>─── Un employé spécifique ───</option>
                {filteredEmp.map((e) => (
                  <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-widest font-semibold text-[#475569]">Description (optionnel)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Courte description qui apparaîtra sous le titre…"
              data-testid="doc-upload-description"
              className="ms-input mt-1 resize-none"
            />
          </div>
        </div>

        <div className="border-t border-[#071B34]/5 p-4 flex items-center gap-2 bg-[#F4F7FA]/50">
          <button
            onClick={onClose}
            disabled={busy}
            className="flex-1 h-11 rounded-xl bg-white hover:bg-[#F4F7FA] border border-[#071B34]/10 text-sm font-semibold text-[#334155] disabled:opacity-40"
          >
            Annuler
          </button>
          <button
            onClick={submit}
            disabled={busy || !file || !name.trim()}
            data-testid="doc-upload-submit"
            className="flex-1 h-11 rounded-xl bg-[#3BA4FF] hover:bg-[#2A8DE0] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold inline-flex items-center justify-center gap-2"
          >
            <Plus className="h-4 w-4" />
            {busy ? "Publication…" : "Publier"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditDocModal({ doc, employees, onClose, onDone }) {
  const fileRef = useRef(null);
  const [name, setName] = useState(doc.name || "");
  const [category, setCategory] = useState(doc.category || "Ressources Humaines");
  const [description, setDescription] = useState(doc.raw?.description || "");
  const [target, setTarget] = useState(doc.raw?.target_employee_id || "all");
  const [newFile, setNewFile] = useState(null);
  const [busy, setBusy] = useState(false);

  const onPickFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.type && f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Seuls les fichiers PDF sont acceptés");
      e.target.value = "";
      return;
    }
    setNewFile(f);
  };

  const submit = async () => {
    if (!name.trim()) { toast.error("Nom requis"); return; }
    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        category,
        description: description.trim() || null,
        target_employee_id: target === "all" ? "all" : target,
      };
      // If a new file was picked, upload it and swap the URL / size
      if (newFile) {
        const form = new FormData();
        form.append("file", newFile);
        const { data: up } = await api.post("/uploads", form, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        payload.url = up.url;
        payload.size_kb = Math.max(1, Math.round((up.size || newFile.size || 0) / 1024));
      }
      await api.put(`/admin/documents/${doc.id}`, payload);
      toast.success("Document mis à jour");
      onDone?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Impossible de mettre à jour");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        data-testid="doc-edit-modal"
        className="bg-white rounded-3xl w-full max-w-lg max-h-[90vh] overflow-hidden shadow-2xl flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#071B34]/5">
          <div>
            <h3 className="text-base font-bold text-[#071B34]">Modifier le document</h3>
            <p className="text-xs text-[#475569] mt-0.5">Titre, catégorie, destinataire, PDF.</p>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-lg hover:bg-[#F4F7FA] inline-flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">
          <div>
            <label className="text-[10px] uppercase tracking-widest font-semibold text-[#475569]">Fichier PDF</label>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf"
              onChange={onPickFile}
              className="hidden"
              data-testid="doc-edit-file"
            />
            <div className="mt-1 flex items-center gap-3 rounded-2xl border border-[#071B34]/10 p-3">
              <FileText className="h-6 w-6 text-[#EF4444]" />
              <div className="flex-1 min-w-0 text-sm">
                <div className="font-semibold text-[#071B34] truncate">
                  {newFile ? newFile.name : (doc.name || "Document actuel")}
                </div>
                <div className="text-[11px] text-[#475569]">
                  {newFile ? `${Math.max(1, Math.round(newFile.size / 1024))} Ko — nouveau fichier` : `PDF actuel${doc.size_kb ? ` · ${doc.size_kb} Ko` : ""}`}
                </div>
              </div>
              <button
                onClick={() => fileRef.current?.click()}
                data-testid="doc-edit-swap"
                className="rounded-xl bg-[#F4F7FA] hover:bg-[#3BA4FF]/10 px-3 py-2 text-xs font-semibold text-[#334155] inline-flex items-center gap-1"
              >
                <Upload className="h-3 w-3" /> Remplacer
              </button>
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-widest font-semibold text-[#475569]">Nom du document</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="doc-edit-name"
              className="ms-input mt-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-widest font-semibold text-[#475569]">Catégorie</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                data-testid="doc-edit-category"
                className="ms-input mt-1"
              >
                {CATEGORIES.filter((c) => c.k !== "all").map((c) => (
                  <option key={c.k} value={c.k}>{c.l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest font-semibold text-[#475569]">Destinataire</label>
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                data-testid="doc-edit-target"
                className="ms-input mt-1"
              >
                <option value="all">Tous les employés</option>
                {(employees || []).filter((e) => !e.is_super_admin).map((e) => (
                  <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-widest font-semibold text-[#475569]">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              data-testid="doc-edit-description"
              className="ms-input mt-1 resize-none"
            />
          </div>
        </div>
        <div className="border-t border-[#071B34]/5 p-4 flex items-center gap-2 bg-[#F4F7FA]/50">
          <button
            onClick={onClose}
            disabled={busy}
            className="flex-1 h-11 rounded-xl bg-white hover:bg-[#F4F7FA] border border-[#071B34]/10 text-sm font-semibold text-[#334155] disabled:opacity-40"
          >
            Annuler
          </button>
          <button
            onClick={submit}
            disabled={busy || !name.trim()}
            data-testid="doc-edit-save"
            className="flex-1 h-11 rounded-xl bg-[#3BA4FF] hover:bg-[#2A8DE0] disabled:opacity-50 text-white text-sm font-bold inline-flex items-center justify-center gap-2"
          >
            {busy ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}




