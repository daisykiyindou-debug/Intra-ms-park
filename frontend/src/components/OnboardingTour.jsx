import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, ArrowLeft, X, CheckCircle2, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";

/**
 * Guided step-by-step tour for brand-new employees. Runs AFTER the
 * WelcomePopup has been dismissed (i.e. `me.needs_welcome === false`
 * and `me.needs_tour === true`). Highlights key sidebar items with a
 * spotlight cutout + tooltip, walks the user through the intranet.
 * Completion (or "Skip") calls `POST /me/tour/complete`.
 */

const STEPS = [
  {
    testid: "nav-dashboard",
    title: "Tableau de bord",
    text: "Ta page d'accueil : heure de Paris en temps réel, ton planning du jour, les actualités MS Park et l'agenda de l'équipe.",
    emoji: "📊",
  },
  {
    testid: "nav-profil",
    title: "Mon profil",
    text: "Vérifie et complète tes informations personnelles (téléphone, adresse, contact d'urgence) et personnalise ton avatar.",
    emoji: "👤",
  },
  {
    testid: "nav-news",
    title: "Actualités",
    text: "Le fil d'actualité MS Park : annonces officielles, événements, nouveautés Direction, RH & Restauration.",
    emoji: "📰",
  },
  {
    testid: "nav-messagerie",
    title: "Messagerie",
    text: "Discute avec tes collègues et les services (RH, Direction, Communication…). L'équipe RH t'y a d'ailleurs laissé un mot de bienvenue !",
    emoji: "💬",
  },
  {
    testid: "nav-planning",
    title: "Planning",
    text: "Consulte tes horaires de la semaine, tes jours OFF et tes formations. Toujours à jour, synchronisé avec ton manager.",
    emoji: "📅",
  },
  {
    testid: "nav-badge",
    title: "Badge",
    text: "Enregistre tes entrées / sorties et suis ton temps de travail en temps réel.",
    emoji: "🕒",
  },
  {
    testid: "nav-demandes",
    title: "Congés & absences",
    text: "Dépose tes demandes de congés (CP, RTT, récupération…) et suis leur validation en direct.",
    emoji: "🌴",
  },
  {
    testid: "nav-restaurant",
    title: "Restauration",
    text: "Consulte le menu du Soccer Bar & du Donut House, et utilise tes points repas pour commander tes plats préférés.",
    emoji: "🍽️",
  },
  {
    testid: "nav-cse",
    title: "CSE & Avantages",
    text: "Profite des billets, réductions et bons plans négociés par le CSE (cinéma, parcs, escape games…).",
    emoji: "🎁",
  },
  {
    testid: "nav-documents",
    title: "Documents & fiches de paie",
    text: "Retrouve ton contrat, tes fiches de paie et tous les documents RH partagés — téléchargeables à tout moment.",
    emoji: "📁",
  },
  {
    testid: "nav-help",
    title: "Centre d'aide",
    text: "Une question ? Un souci ? Contacte le Support IT ou consulte le centre d'aide, disponible 24h/24.",
    emoji: "💡",
  },
];

function useAnchorRect(testid, active) {
  const [rect, setRect] = useState(null);
  useEffect(() => {
    if (!active || !testid) {
      setRect(null);
      return;
    }
    let raf = 0;
    const compute = () => {
      const el = document.querySelector(`[data-testid="${testid}"]`);
      if (!el) {
        setRect(null);
        return;
      }
      // Ensure the sidebar item is visible in its scroll container
      try { el.scrollIntoView({ block: "nearest", behavior: "instant" }); } catch { /* noop */ }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    const loop = () => {
      compute();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    window.addEventListener("resize", compute);
    window.addEventListener("scroll", compute, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", compute);
      window.removeEventListener("scroll", compute, true);
    };
  }, [testid, active]);
  return rect;
}

export default function OnboardingTour() {
  const { me, refreshMe } = useApp();
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  // Show only after the welcome popup has been dismissed AND the tour is
  // still pending on the backend. Guarded by a local flag so refreshing the
  // page during the tour doesn't restart at step 0 involuntarily.
  useEffect(() => {
    if (!me) return;
    if (me.needs_welcome) return;
    if (!me.needs_tour) return;
    // Small delay so the welcome popup close animation finishes cleanly.
    const t = setTimeout(() => setVisible(true), 250);
    return () => clearTimeout(t);
  }, [me?.id, me?.needs_welcome, me?.needs_tour]);

  const step = STEPS[index];
  const rect = useAnchorRect(step?.testid, visible);

  const finish = async () => {
    setDismissing(true);
    try {
      await api.post("/me/tour/complete");
      await refreshMe?.();
    } catch (_) {
      /* swallow */
    }
    setVisible(false);
    setDismissing(false);
  };

  const total = STEPS.length;

  // Tooltip placement: to the right of the sidebar item (desktop). On
  // small screens (no rect fits or narrow width), we render a floating
  // centered card instead.
  const placement = useMemo(() => {
    if (!rect) return null;
    const spacing = 16;
    const tooltipW = 360;
    const tooltipH = 220;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Prefer right side of the sidebar item
    let left = rect.left + rect.width + spacing;
    let top = rect.top + rect.height / 2 - tooltipH / 2;
    let arrow = "left"; // arrow on left of tooltip pointing to item
    if (left + tooltipW + 16 > vw) {
      // Not enough room on the right → fallback below the item
      left = Math.max(16, Math.min(vw - tooltipW - 16, rect.left));
      top = rect.top + rect.height + spacing;
      arrow = "top";
    }
    if (top < 12) top = 12;
    if (top + tooltipH > vh - 12) top = vh - tooltipH - 12;
    return { left, top, arrow };
  }, [rect]);

  if (!visible || !me) return null;

  return createPortal(
    <div className="fixed inset-0 z-[95] pointer-events-none" data-testid="onboarding-tour">
      {/* Dimming layer with a spotlight cutout around the anchor */}
      <SpotlightOverlay rect={rect} />

      {/* Tooltip card */}
      <div
        className="absolute pointer-events-auto"
        style={
          placement && rect
            ? { left: placement.left, top: placement.top, width: 360 }
            : { left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: "min(360px, calc(100vw - 32px))" }
        }
      >
        <div className="relative rounded-2xl bg-white shadow-2xl ring-1 ring-[#071B34]/10 overflow-hidden">
          {/* Arrow (desktop only, when anchored) */}
          {placement && rect && placement.arrow === "left" && (
            <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 h-3 w-3 rotate-45 bg-white ring-1 ring-[#071B34]/10" />
          )}
          {placement && rect && placement.arrow === "top" && (
            <div className="absolute -top-1.5 left-8 h-3 w-3 rotate-45 bg-white ring-1 ring-[#071B34]/10" />
          )}

          {/* Header band */}
          <div className="bg-gradient-to-br from-[#3BA4FF] to-[#1D70B8] px-5 pt-4 pb-3 text-white">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] font-bold bg-white/15 backdrop-blur px-2 py-0.5 rounded-full">
                <Sparkles className="h-3 w-3" /> Étape {index + 1} / {total}
              </span>
              <button
                onClick={finish}
                data-testid="tour-close"
                className="ml-auto h-7 w-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors"
                title="Passer le tutoriel"
                aria-label="Passer le tutoriel"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-2xl leading-none">{step.emoji}</span>
              <h4 className="text-base font-extrabold leading-tight">{step.title}</h4>
            </div>
          </div>

          {/* Body */}
          <div className="px-5 py-4">
            <p className="text-sm text-[#334155] leading-relaxed">{step.text}</p>

            {/* Progress bar */}
            <div className="mt-4 h-1.5 rounded-full bg-[#F1F5F9] overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#3BA4FF] to-[#1D70B8] transition-all duration-500"
                style={{ width: `${((index + 1) / total) * 100}%` }}
              />
            </div>

            {/* Actions */}
            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={finish}
                disabled={dismissing}
                data-testid="tour-skip"
                className="text-xs font-semibold text-[#475569] hover:text-[#071B34] transition-colors"
              >
                Passer
              </button>
              <div className="ml-auto flex gap-2">
                {index > 0 && (
                  <button
                    onClick={() => setIndex((i) => Math.max(0, i - 1))}
                    data-testid="tour-prev"
                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold text-[#475569] hover:bg-[#F4F7FA] transition-colors"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" /> Précédent
                  </button>
                )}
                {index < total - 1 ? (
                  <button
                    onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
                    data-testid="tour-next"
                    className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-xs font-bold text-white bg-[#3BA4FF] hover:bg-[#1D70B8] transition-colors shadow-md"
                  >
                    Suivant <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <button
                    onClick={finish}
                    disabled={dismissing}
                    data-testid="tour-finish"
                    className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-xs font-bold text-white bg-[#10B981] hover:bg-[#059669] transition-colors shadow-md disabled:opacity-60"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Terminer
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Full-screen dimmed backdrop with a rounded rectangle "hole" around the
// current tour anchor. Implemented via SVG mask so the anchor stays fully
// interactive-looking while the rest of the UI is darkened.
function SpotlightOverlay({ rect }) {
  const pad = 6;
  const radius = 12;
  const x = rect ? Math.max(0, rect.left - pad) : 0;
  const y = rect ? Math.max(0, rect.top - pad) : 0;
  const w = rect ? rect.width + pad * 2 : 0;
  const h = rect ? rect.height + pad * 2 : 0;
  return (
    <svg className="absolute inset-0 h-full w-full" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <mask id="ms-tour-mask">
          <rect x="0" y="0" width="100%" height="100%" fill="white" />
          {rect && <rect x={x} y={y} width={w} height={h} rx={radius} ry={radius} fill="black" />}
        </mask>
      </defs>
      <rect x="0" y="0" width="100%" height="100%" fill="rgba(7, 27, 52, 0.55)" mask="url(#ms-tour-mask)" />
      {rect && (
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          rx={radius}
          ry={radius}
          fill="none"
          stroke="#3BA4FF"
          strokeWidth="2"
          className="animate-pulse"
        />
      )}
    </svg>
  );
}
