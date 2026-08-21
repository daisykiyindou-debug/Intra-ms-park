import { useEffect, useState } from "react";
import { X, Lock, User, Calendar, LifeBuoy, Rocket } from "lucide-react";
import PortalModal from "@/components/PortalModal";
import { api } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";

/**
 * First-login welcome modal. Shown once per employee — dismissed via
 * `POST /me/welcome` which persists the `welcomed_at` timestamp server-side.
 */
export default function WelcomePopup() {
  const { me, refreshMe } = useApp();
  const [open, setOpen] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    if (me?.needs_welcome) setOpen(true);
  }, [me?.needs_welcome, me?.id]);

  const dismiss = async () => {
    setDismissing(true);
    try {
      await api.post("/me/welcome");
      await refreshMe?.();
    } catch (_) {
      // swallow — closing the modal doesn't need to fail the user
    }
    setOpen(false);
    setDismissing(false);
  };

  if (!open) return null;

  return (
    <PortalModal>
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#071B34]/60 backdrop-blur-sm px-4 py-6 overflow-y-auto" data-testid="welcome-popup">
        <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden">
          {/* Header band */}
          <div className="relative bg-gradient-to-br from-[#3BA4FF] to-[#1D70B8] px-6 py-6 text-white">
            <button onClick={dismiss} data-testid="welcome-close" className="absolute top-3 right-3 h-8 w-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors">
              <X className="h-4 w-4" />
            </button>
            <div className="text-4xl mb-1">👋</div>
            <h2 className="text-2xl font-bold">Bienvenue sur votre intranet&nbsp;!</h2>
            <p className="mt-1 text-sm text-white/90">
              Nous sommes ravis de vous compter parmi nous, {me?.first_name || "cher collaborateur"} — cet intranet est votre espace d&apos;information, de collaboration et de services au quotidien.
            </p>
          </div>

          {/* Recommendations */}
          <div className="p-6 space-y-4 max-h-[55vh] overflow-y-auto">
            <p className="text-sm text-[#334155]">
              Avant de commencer, nous vous recommandons de réaliser les quelques étapes ci-dessous afin de sécuriser votre compte et profiter pleinement de toutes les fonctionnalités.
            </p>

            <Step icon={Lock} title="🔒 Modifiez votre mot de passe"
              text="Pour des raisons de sécurité, nous vous recommandons de remplacer votre mot de passe temporaire par un mot de passe personnel, unique et sécurisé." />
            <Step icon={User} title="👤 Complétez votre profil"
              text="Vérifiez que vos informations personnelles (e-mail, téléphone, etc.) sont correctes." />
            <Step icon={Calendar} title="📅 Consultez votre planning"
              text="Prenez connaissance de vos horaires de travail et de vos jours OFF." />
            <Step icon={LifeBuoy} title="💡 Besoin d'aide ?"
              text="En cas de question ou de problème, vous pouvez contacter le Centre d'aide directement depuis l'intranet." />

            <div className="pt-2 border-t border-[#071B34]/8">
              <p className="text-sm text-[#334155]">
                Nous vous souhaitons une excellente expérience sur l&apos;intranet MS Park et une très bonne journée&nbsp;!
              </p>
              <p className="text-sm text-[#071B34] mt-1"><strong>L&apos;équipe MS Park</strong> 🚀</p>
            </div>
          </div>

          {/* CTA */}
          <div className="px-6 pb-6">
            <button
              onClick={dismiss}
              disabled={dismissing}
              data-testid="welcome-cta"
              className="w-full h-11 rounded-xl bg-[#3BA4FF] hover:bg-[#1D70B8] disabled:opacity-60 text-white font-bold text-sm inline-flex items-center justify-center gap-2 transition-colors"
            >
              <Rocket className="h-4 w-4" /> C&apos;est parti&nbsp;!
            </button>
          </div>
        </div>
      </div>
    </PortalModal>
  );
}

function Step({ icon: Icon, title, text }) {
  return (
    <div className="flex gap-3 rounded-2xl bg-[#F4F7FA] p-3">
      <div className="h-9 w-9 shrink-0 rounded-lg bg-white text-[#3BA4FF] flex items-center justify-center ring-1 ring-[#3BA4FF]/20">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-bold text-[#071B34]">{title}</div>
        <div className="text-xs text-[#475569] mt-0.5 leading-relaxed">{text}</div>
      </div>
    </div>
  );
}
