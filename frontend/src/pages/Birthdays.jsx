import { useEffect, useMemo, useState } from "react";
import { Cake, Gift, Calendar, MoreHorizontal, Sparkles, Send } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";

const FR_MONTHS = [
  "janv.", "févr.", "mars", "avr.", "mai", "juin",
  "juil.", "août", "sept.", "oct.", "nov.", "déc.",
];

function initials(name) {
  return (name || "?").split(/\s+/).map((s) => s[0]).join("").slice(0, 2).toUpperCase();
}

function daysLabel(days) {
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return "Demain";
  if (days < 30) return `Dans ${days} jours`;
  if (days < 60) return `Dans 1 mois`;
  const months = Math.round(days / 30);
  return `Dans ${months} mois`;
}

export default function Birthdays() {
  const { me } = useApp();
  const [tab, setTab] = useState("upcoming"); // upcoming | past
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const perPage = 8;

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/birthdays?view=${tab}`);
      setItems(data);
      setPage(1);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [tab]);

  const pageCount = Math.max(1, Math.ceil(items.length / perPage));
  const paged = items.slice((page - 1) * perPage, page * perPage);

  const wish = async (emp) => {
    try {
      // Post a public greeting on the fil (only admins can post normally,
      // so fall back to a toast if the endpoint refuses).
      await api.post("/posts", {
        title: `Joyeux anniversaire ${emp.first_name} !`,
        content: `<p>Toute l'équipe MS Park te souhaite un excellent anniversaire ${emp.first_name} ! 🎂</p>`,
        category: "annonce",
        posted_as: "personal",
      });
      toast.success(`Vœux envoyés à ${emp.first_name}`);
    } catch {
      // If not admin, just show a personal toast — the wish is symbolic
      toast.success(`Un petit mot chaleureux pour ${emp.first_name} 🎂`);
    }
  };

  return (
    <div className="space-y-6 ms-fade-up">
      {/* Header with the birthday illustration */}
      <div className="ms-card overflow-hidden">
        <div className="relative px-6 py-8 md:px-8 md:py-10">
          <div className="ms-overline">Vie de l&apos;entreprise › Anniversaires</div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[#071B34] mt-1 flex items-center gap-2">
            Anniversaires
          </h1>
          <p className="text-sm text-[#475569] mt-1 max-w-lg">
            Retrouvez ici la liste des anniversaires à venir de vos collègues.
          </p>
          <div className="absolute -right-4 -top-4 md:right-6 md:top-3 opacity-90 pointer-events-none">
            <CakeIllustration />
          </div>
        </div>

        {/* Tabs */}
        <div className="border-t border-[#071B34]/5 px-4 md:px-6 flex items-center gap-6">
          {[
            { k: "upcoming", l: "À venir" },
            { k: "past", l: "Anniversaires passés" },
          ].map((t) => (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              data-testid={`bd-tab-${t.k}`}
              className={`relative py-3 text-sm font-semibold inline-flex items-center gap-2 transition-colors ${
                tab === t.k ? "text-[#4338CA]" : "text-[#475569] hover:text-[#071B34]"
              }`}
            >
              <Calendar className="h-4 w-4" />
              {t.l}
              {tab === t.k && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-[#4338CA] rounded-t" />}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="ms-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-[#F4F7FA]">
              <tr className="text-left text-[10px] uppercase tracking-widest text-[#475569] font-semibold">
                <th className="px-4 py-3">Collaborateur</th>
                <th className="px-4 py-3">Date d&apos;anniversaire</th>
                <th className="px-4 py-3">Jours restants</th>
                <th className="px-4 py-3 text-right pr-6">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#071B34]/5">
              {loading && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-[#475569]">Chargement…</td></tr>
              )}
              {!loading && paged.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-[#475569]">Aucun anniversaire.</td></tr>
              )}
              {!loading && paged.map((r) => (
                <tr key={r.id} data-testid={`bd-row-${r.id}`} className="hover:bg-[#F4F7FA]">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {r.avatar
                        ? <img src={r.avatar} alt="" className="h-10 w-10 rounded-full object-cover" />
                        : <div className="h-10 w-10 rounded-full bg-[#4338CA]/15 text-[#4338CA] flex items-center justify-center font-bold">
                            {initials(`${r.first_name} ${r.last_name}`)}
                          </div>}
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-[#071B34] truncate">
                          {r.first_name} {r.last_name}
                        </div>
                        <div className="text-xs text-[#475569] truncate">{r.role || r.department || "—"}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-[#334155] font-semibold">
                      <Calendar className="h-3.5 w-3.5 text-[#94A3B8]" />
                      {r.day} {FR_MONTHS[r.month - 1]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full ${
                      r.days_until === 0
                        ? "bg-[#F5D0FE] text-[#701A75]"
                        : "bg-[#EEF2FF] text-[#4338CA]"
                    }`}>
                      {r.days_until === 0 && <Cake className="h-3.5 w-3.5" />}
                      {daysLabel(r.days_until)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right pr-6">
                    <div className="inline-flex items-center gap-1">
                      <button
                        onClick={() => wish(r)}
                        data-testid={`bd-wish-${r.id}`}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-[#071B34]/10 hover:border-[#4338CA]/30 hover:bg-[#4338CA]/5 px-3 py-1.5 text-xs font-semibold text-[#334155]"
                      >
                        <Gift className="h-3.5 w-3.5" /> Souhaiter
                      </button>
                      <button className="h-8 w-8 rounded-lg hover:bg-[#071B34]/5 inline-flex items-center justify-center text-[#475569]">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {items.length > perPage && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[#071B34]/5">
            <div className="text-xs text-[#475569]">
              Affichage de {(page - 1) * perPage + 1} à {Math.min(items.length, page * perPage)} sur {items.length} anniversaires {tab === "upcoming" ? "à venir" : "passés"}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="h-8 w-8 rounded-lg border border-[#071B34]/10 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center"
              >‹</button>
              {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`h-8 min-w-[32px] px-2 rounded-lg text-xs font-semibold ${
                    p === page ? "bg-[#4338CA] text-white" : "border border-[#071B34]/10 text-[#334155]"
                  }`}
                >{p}</button>
              ))}
              <button
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={page === pageCount}
                className="h-8 w-8 rounded-lg border border-[#071B34]/10 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center"
              >›</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CakeIllustration() {
  return (
    <svg width="180" height="140" viewBox="0 0 180 140" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <linearGradient id="cakeBody" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#F0ABFC" />
          <stop offset="1" stopColor="#A78BFA" />
        </linearGradient>
      </defs>
      <ellipse cx="94" cy="130" rx="70" ry="6" fill="#EDE9FE" />
      <rect x="34" y="70" width="120" height="50" rx="8" fill="url(#cakeBody)" />
      <rect x="34" y="70" width="120" height="10" fill="#F5D0FE" />
      <path d="M34 90 Q54 100 74 90 T114 90 T154 90 V80 H34 Z" fill="#EDE9FE" opacity="0.55" />
      <rect x="86" y="52" width="4" height="20" rx="1" fill="#A78BFA" />
      <path d="M88 40 Q92 46 88 52 Q84 46 88 40 Z" fill="#F59E0B" />
      <rect x="66" y="58" width="3" height="14" rx="1" fill="#A78BFA" />
      <path d="M67 48 Q70 53 67 58 Q64 53 67 48 Z" fill="#F59E0B" />
      <rect x="106" y="58" width="3" height="14" rx="1" fill="#A78BFA" />
      <path d="M108 48 Q111 53 108 58 Q105 53 108 48 Z" fill="#F59E0B" />
      <circle cx="30" cy="40" r="3" fill="#F0ABFC" />
      <circle cx="160" cy="52" r="4" fill="#A78BFA" opacity="0.6" />
      <circle cx="150" cy="30" r="2" fill="#F59E0B" />
    </svg>
  );
}
