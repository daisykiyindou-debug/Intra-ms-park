import { useMemo, useState, useEffect } from "react";
import { FileText, Download, Eye, Search, X, Receipt, Star } from "lucide-react";
import { Link } from "react-router-dom";
import { api, formatDateFr } from "@/lib/api";
import useLiveData from "@/hooks/useLiveData";

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
  const [docs, setDocs] = useState([]);
  const [hrDocs, setHrDocs] = useState([]);
  const [favIds, setFavIds] = useState(() => new Set(JSON.parse(localStorage.getItem("docFavs") || "[]")));
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("all");
  const [preview, setPreview] = useState(null);

  useLiveData(() => api.get("/documents").then((r) => setDocs(r.data)), ["documents"]);
  useEffect(() => { api.get("/hr-documents").then((r) => setHrDocs(r.data)); }, []);

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
        <div>
          <div className="ms-overline">Accueil › Documents</div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[#071B34] mt-1">Documents</h1>
          <p className="text-sm text-[#475569] mt-1">Retrouvez et téléchargez tous les documents disponibles.</p>
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
            <DocCard key={d.id} d={d} isFav={favIds.has(d.id)} onFav={() => toggleFav(d.id)} onPreview={() => setPreview(d)} />
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
        <div role="dialog" aria-modal="true" onClick={() => setPreview(null)} className="fixed inset-0 z-50 bg-black/50 backdrop-blur-md flex items-center justify-center p-4">
          <div onClick={(e) => e.stopPropagation()} data-testid="doc-preview" className="bg-white rounded-2xl max-w-3xl w-full h-[80vh] p-0 overflow-hidden">
            <div className="flex items-center justify-between px-5 h-14 border-b border-[#071B34]/5">
              <h4 className="text-sm font-bold text-[#071B34]">{preview.name}</h4>
              <button onClick={() => setPreview(null)} className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[#071B34]/5"><X className="h-4 w-4" /></button>
            </div>
            <iframe title="preview" src={preview.url} className="w-full h-[calc(80vh-3.5rem)]" />
          </div>
        </div>
      )}
    </div>
  );
}

function DocCard({ d, isFav, onFav, onPreview }) {
  const ext = (d.url || "").split(".").pop()?.toUpperCase() || (d.kind === "rich" ? "HTML" : "PDF");
  const colorForExt = {
    PDF: "bg-[#EF4444]", DOCX: "bg-[#3BA4FF]", DOC: "bg-[#3BA4FF]",
    XLSX: "bg-[#10B981]", XLS: "bg-[#10B981]", PPTX: "bg-[#F59E0B]", PPT: "bg-[#F59E0B]",
    HTML: "bg-[#8B5CF6]", ZIP: "bg-[#F59E0B]",
  }[ext] || "bg-[#3BA4FF]";
  return (
    <div className="ms-card p-4 space-y-2 hover:shadow-md transition-shadow" data-testid={`doc-${d.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className={`inline-flex items-center justify-center h-11 w-11 rounded-xl text-white font-bold text-[10px] ${colorForExt}`}>{ext}</div>
        <button onClick={onFav} className={`h-8 w-8 rounded-lg ${isFav ? "text-[#F59E0B]" : "text-[#94A3B8]"} hover:bg-[#F4F7FA]`}>
          <Star className={`h-4 w-4 ${isFav ? "fill-[#F59E0B]" : ""}`} />
        </button>
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


