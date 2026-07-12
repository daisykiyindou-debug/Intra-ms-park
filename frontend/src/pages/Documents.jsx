import { useEffect, useMemo, useState } from "react";
import { FileText, Download, Eye, Search, X, Receipt } from "lucide-react";
import { Link } from "react-router-dom";
import { api, formatDateFr } from "@/lib/api";

const CATEGORIES = [
  { k: "all", l: "Tous" },
  { k: "Paie", l: "Paie" },
  { k: "Contrats", l: "Contrats" },
  { k: "Règlements", l: "Règlements" },
  { k: "Sécurité", l: "Sécurité" },
  { k: "Planning", l: "Planning" },
  { k: "Attestations", l: "Attestations" },
];

export default function Documents() {
  const [docs, setDocs] = useState([]);
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    api.get("/documents").then((r) => setDocs(r.data));
  }, []);

  const filtered = useMemo(() => {
    return docs.filter((d) => {
      if (cat !== "all" && d.category !== cat) return false;
      if (q && !d.name.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [docs, cat, q]);

  return (
    <div className="space-y-6 ms-fade-up">
      <div>
        <div className="ms-overline">Mon Coin RH</div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[#071B34] mt-1">Documents RH</h1>
        <p className="text-sm text-[#475569] mt-2">
          Vos fiches de paie, contrats et documents internes — toujours sous la main.
        </p>
      </div>

      <div className="ms-card p-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#475569]" />
          <input
            placeholder="Rechercher un document…"
            data-testid="search-docs"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="ms-input pl-10"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {CATEGORIES.map((c) => (
            <button
              key={c.k}
              onClick={() => setCat(c.k)}
              data-testid={`cat-${c.k}`}
              className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                cat === c.k ? "bg-[#071B34] text-white" : "bg-[#F4F7FA] text-[#475569] hover:bg-[#071B34]/5"
              }`}
            >
              {c.l}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.length === 0 && (
          <div className="ms-card col-span-full p-12 text-center text-sm text-[#475569]">
            Aucun document trouvé.
          </div>
        )}
        {filtered.map((d) => (
          <div key={d.id} className="ms-card ms-card-hover p-5 flex items-start gap-4" data-testid={`doc-${d.id}`}>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#3BA4FF]/12 text-[#3BA4FF]">
              <FileText className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-[#071B34] line-clamp-1">{d.name}</h4>
                {!d.read && <span className="h-2 w-2 rounded-full bg-[#3BA4FF]" />}
              </div>
              <div className="text-xs text-[#475569] mt-0.5">
                {d.category} · {formatDateFr(d.issued_at)} · {d.size_kb} Ko
              </div>
              <div className="mt-3 flex items-center gap-2">
                {d.is_payslip ? (
                  <Link
                    to={`/documents/payslip/${d.target_employee_id}/${d.payslip_year}/${d.payslip_month}`}
                    data-testid={`open-payslip-${d.id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#3BA4FF] hover:bg-[#2A8DE0] px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    <Receipt className="h-3.5 w-3.5" /> Voir la fiche
                  </Link>
                ) : (
                  <>
                    <button
                      onClick={() => setPreview(d)}
                      data-testid={`preview-${d.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#F4F7FA] hover:bg-[#071B34]/5 px-3 py-1.5 text-xs font-semibold text-[#071B34]"
                    >
                      <Eye className="h-3.5 w-3.5" /> Aperçu
                    </button>
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noreferrer"
                      data-testid={`download-${d.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#3BA4FF] hover:bg-[#2A8DE0] px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      <Download className="h-3.5 w-3.5" /> Télécharger
                    </a>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {preview && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setPreview(null)}
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-md flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            data-testid="doc-preview"
            className="ms-card max-w-3xl w-full h-[80vh] p-0 overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 h-14 border-b border-[#071B34]/5">
              <h4 className="text-sm font-bold text-[#071B34]">{preview.name}</h4>
              <button onClick={() => setPreview(null)} className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[#071B34]/5">
                <X className="h-4 w-4" />
              </button>
            </div>
            <iframe title="preview" src={preview.url} className="w-full h-[calc(80vh-3.5rem)]" />
          </div>
        </div>
      )}
    </div>
  );
}
