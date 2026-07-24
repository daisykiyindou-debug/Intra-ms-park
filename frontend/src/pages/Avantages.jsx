import { useEffect, useState } from "react";
import { QrCode, Tag, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

export default function Avantages() {
  const [partners, setPartners] = useState([]);
  const [copied, setCopied] = useState(null);

  useEffect(() => {
    api.get("/partners").then((r) => setPartners(r.data));
  }, []);

  const copy = (code) => {
    navigator.clipboard.writeText(code);
    setCopied(code);
    toast.success("Code copié !");
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-6 ms-fade-up">
      <div>
        <div className="ms-overline">Vie de l&apos;entreprise › CSE &amp; Avantages</div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[#071B34] mt-1">
          CSE &amp; Avantages
        </h1>
        <p className="text-sm text-[#475569] mt-2 max-w-2xl">
          Profitez de réductions exclusives chez nos partenaires et des avantages internes MS Park.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {partners.map((p) => (
          <div
            key={p.id}
            className="ms-card ms-card-hover overflow-hidden flex flex-col"
            data-testid={`partner-${p.id}`}
          >
            <div className="relative aspect-[16/9] overflow-hidden bg-[#071B34]">
              <img src={p.image} alt={p.name} className="h-full w-full object-cover opacity-80 transition-transform duration-500 hover:scale-110" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#071B34] via-transparent to-transparent" />
              <div className="absolute top-3 left-3">
                <span className="ms-chip bg-white/95 text-[#071B34] backdrop-blur-md shadow-md">
                  <Tag className="h-3 w-3" /> {p.category}
                </span>
              </div>
              <div className="absolute bottom-3 right-3 rounded-2xl bg-[#3BA4FF] px-4 py-2 text-2xl font-extrabold text-white shadow-lg">
                {p.discount}
              </div>
            </div>
            <div className="p-5 flex-1 flex flex-col">
              <h3 className="text-lg font-bold text-[#071B34]">{p.name}</h3>
              <p className="text-sm text-[#475569] mt-1 line-clamp-3">{p.description}</p>
              <div className="mt-4 flex items-center gap-3 rounded-xl bg-[#F4F7FA] p-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#071B34] text-white">
                  <QrCode className="h-6 w-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-[#475569]">
                    Code partenaire
                  </div>
                  <div className="font-mono text-xs text-[#071B34] truncate">{p.qr_code}</div>
                </div>
                <button
                  onClick={() => copy(p.qr_code)}
                  data-testid={`copy-${p.id}`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white hover:bg-[#3BA4FF]/10 transition-colors"
                >
                  {copied === p.qr_code ? (
                    <Check className="h-4 w-4 text-[#10B981]" />
                  ) : (
                    <Copy className="h-4 w-4 text-[#475569]" />
                  )}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
