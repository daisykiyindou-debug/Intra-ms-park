import { useEffect, useState, useRef } from "react";
import confetti from "canvas-confetti";
import { Cake, Gift, Coins, ShoppingBag, Check } from "lucide-react";
import { api } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";
import PortalModal from "@/components/PortalModal";

/**
 * BirthdayGate — sits at the app root. When the current user's birthday is
 * today AND the popup has not yet been shown this year, launch a full-screen
 * confetti burst and display the gift popup. On confirmation the backend
 * credits 10 meal points valid 30 days.
 */
export default function BirthdayGate() {
  const { me } = useApp();
  const [status, setStatus] = useState(null); // { is_birthday_today, already_seen_this_year, ... }
  const [showPopup, setShowPopup] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!me?.id) return;
    api.get("/me/birthday")
      .then((r) => {
        setStatus(r.data);
        if (r.data.is_birthday_today && !r.data.already_seen_this_year) {
          setShowPopup(true);
        }
      })
      .catch(() => {});
  }, [me?.id]);

  // Full-page confetti when popup opens
  useEffect(() => {
    if (!showPopup) return;
    burstConfetti();
    const t1 = setTimeout(burstConfetti, 700);
    const t2 = setTimeout(burstConfetti, 1400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [showPopup]);

  const confirm = async () => {
    try {
      await api.post("/me/birthday/claim");
      setClaimed(true);
      // one more burst for the fun of it
      setTimeout(() => burstConfetti(), 100);
      setTimeout(() => {
        setShowPopup(false);
        window.dispatchEvent(new CustomEvent("ms-notifications-refresh"));
        window.dispatchEvent(new CustomEvent("ms-meal-refresh"));
      }, 900);
    } catch {
      setShowPopup(false);
    }
  };

  if (!showPopup) return null;

  return (
    <PortalModal>
      <div
        className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-md flex items-center justify-center p-4"
        data-testid="birthday-popup"
      >
        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 w-full h-full"
        />
        <div className="relative bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl">
          {/* Colorful top band */}
          <div className="relative h-32 bg-gradient-to-br from-[#F0ABFC] via-[#A78BFA] to-[#3BA4FF]">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-20 w-20 rounded-full bg-white/25 backdrop-blur-sm ring-4 ring-white/40 flex items-center justify-center">
                <Cake className="h-10 w-10 text-white" />
              </div>
            </div>
            <div className="absolute top-4 left-4 text-[10px] uppercase tracking-widest text-white/85 font-bold">
              🎉 MS Park vous fête
            </div>
          </div>

          <div className="p-6 space-y-4 text-center">
            <h2 className="text-2xl md:text-3xl font-bold text-[#071B34]">
              Joyeux anniversaire, {me?.first_name} !
            </h2>
            <p className="text-sm text-[#475569] max-w-md mx-auto">
              Aujourd&apos;hui, toute l&apos;équipe MS Park te souhaite un merveilleux anniversaire.
              Voici les petits cadeaux qu&apos;on te réserve :
            </p>

            <div className="space-y-2.5 text-left">
              <Gift3 icon={Cake} tone="#EC4899" title="1 brownie d'anniversaire" desc="Offert au Soccer Bar toute la journée." />
              <Gift3 icon={Coins} tone="#F59E0B" title="+10 points repas exceptionnels" desc="Crédité automatiquement, à utiliser dans les 30 jours." highlight />
              <Gift3 icon={ShoppingBag} tone="#3BA4FF" title="Bon d'achat de 20 € au MS Shop" desc="À faire valoir en boutique, valable 30 jours." />
            </div>

            {claimed ? (
              <div className="inline-flex items-center gap-2 rounded-full bg-[#10B981]/15 text-[#047857] px-4 py-2 text-sm font-semibold">
                <Check className="h-4 w-4" /> Cadeaux activés !
              </div>
            ) : (
              <button
                onClick={confirm}
                data-testid="birthday-confirm"
                className="mt-2 w-full rounded-2xl bg-gradient-to-r from-[#A78BFA] to-[#3BA4FF] hover:opacity-95 text-white font-bold py-3.5 shadow-lg transition-opacity"
              >
                J&apos;ai compris — merci ! 🎂
              </button>
            )}
            <p className="text-[11px] text-[#94A3B8]">
              Le brownie et le bon d&apos;achat sont à récupérer directement au Soccer Bar / MS Shop.
            </p>
          </div>
        </div>
      </div>
    </PortalModal>
  );
}

function Gift3({ icon: Icon, tone, title, desc, highlight }) {
  return (
    <div className={`flex items-start gap-3 rounded-2xl p-3 border ${highlight ? "border-[#F59E0B]/40 bg-[#F59E0B]/8" : "border-[#071B34]/8 bg-[#F8FAFC]"}`}>
      <div
        className="h-10 w-10 rounded-2xl flex items-center justify-center shrink-0"
        style={{ background: `${tone}15`, color: tone }}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 text-left">
        <div className="text-sm font-bold text-[#071B34]">{title}</div>
        <div className="text-xs text-[#475569]">{desc}</div>
      </div>
    </div>
  );
}

/** Trigger a symmetric burst of confetti from left+right, using canvas-confetti. */
function burstConfetti() {
  const colors = ["#F0ABFC", "#A78BFA", "#3BA4FF", "#F59E0B", "#EC4899", "#10B981"];
  const defaults = { spread: 60, ticks: 200, gravity: 0.85, scalar: 1.05, colors };
  confetti({
    ...defaults,
    particleCount: 90,
    origin: { x: 0.1, y: 0.4 },
    angle: 60,
  });
  confetti({
    ...defaults,
    particleCount: 90,
    origin: { x: 0.9, y: 0.4 },
    angle: 120,
  });
  confetti({
    ...defaults,
    particleCount: 60,
    origin: { x: 0.5, y: 0.15 },
    angle: 90,
    spread: 100,
  });
}
