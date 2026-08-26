import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogIn, Mail, Lock, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { api, setAuthId } from "@/lib/api";

const MS_PARK_LOGO = "https://customer-assets-jt897jd0.emergentagent.net/job_mspark-employee-hub/artifacts/n4qg1w02_logo%20ms%20park%20transparent.png";

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      setAuthId(data.employee_id);
      localStorage.removeItem("ms_logged_out");
      toast.success(`Bienvenue ${data.first_name} ${data.last_name}`, {
        description: data.is_admin ? "Espace administrateur disponible" : "Espace employé",
      });
      // Force a full reload so AppContext re-fetches /me with the new header
      window.location.href = "/dashboard";
    } catch (err) {
      toast.error("Identifiants incorrects", {
        description: "Veuillez vérifier votre email et votre mot de passe.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#F4F7FA]">
      {/* Left: visual */}
      <div className="md:flex-1 relative overflow-hidden bg-gradient-to-br from-[#071B34] via-[#0B2545] to-[#071B34] text-white p-10 md:p-16 ms-grain">
        <div className="absolute -right-20 -top-20 h-96 w-96 rounded-full bg-[#3BA4FF]/30 blur-3xl" />
        <div className="absolute -left-10 bottom-10 h-64 w-64 rounded-full bg-[#3BA4FF]/15 blur-3xl" />
        <div className="relative flex items-center gap-5">
          <div className="flex h-36 w-36 items-center justify-center rounded-[2rem] bg-white/12 backdrop-blur-md border border-white/15 shadow-2xl shadow-[#3BA4FF]/30 p-3">
            <img
              src={MS_PARK_LOGO}
              alt="MS Park"
              className="h-full w-full object-contain"
              data-testid="login-brand-logo"
            />
          </div>
          <div>
            <div className="text-4xl font-extrabold tracking-tight leading-none">MS Park</div>
            <div className="text-xs uppercase tracking-[0.2em] text-white/50 mt-2">Intranet</div>
          </div>
        </div>
        <div className="relative mt-16 md:mt-32 max-w-md">
          <div className="text-xs uppercase tracking-[0.2em] text-[#3BA4FF] font-semibold">
            Bienvenue sur l&apos;intranet
          </div>
          <h1 className="mt-3 text-4xl md:text-5xl font-extrabold tracking-tight leading-tight">
            Votre espace<br />employé MS Park.
          </h1>
          <p className="mt-6 text-white/70 text-base md:text-lg">
            Planning, points repas, restauration, actualités et bien plus —
            tout MS Park dans la poche, à portée de badge.
          </p>
          <div className="mt-10 flex items-center gap-6 text-xs text-white/40">
            <div>
              <div className="text-2xl font-bold text-white">+220</div>
              <div className="uppercase tracking-wider">Employés</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-white">24/7</div>
              <div className="uppercase tracking-wider">Accès</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-white">100%</div>
              <div className="uppercase tracking-wider">Sécurisé</div>
            </div>
          </div>
        </div>
      </div>

      {/* Right: form */}
      <div className="md:flex-1 flex items-center justify-center p-6 md:p-12">
        <form onSubmit={submit} className="w-full max-w-md" data-testid="login-form">
          <div className="ms-overline">Connexion</div>
          <h2 className="mt-2 text-3xl font-bold text-[#071B34]">Content de vous revoir 👋</h2>
          <p className="mt-2 text-sm text-[#475569]">
            Connectez-vous avec votre identifiant MS Park pour accéder à l&apos;intranet.
          </p>

          <div className="mt-6 space-y-4">
            <div>
              <label className="ms-overline">Email personnel</label>
              <div className="relative mt-2">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#475569]" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="ms-input pl-10"
                  placeholder="vous@exemple.com"
                  data-testid="login-email"
                  required
                />
              </div>
            </div>
            <div>
              <label className="ms-overline">Mot de passe</label>
              <div className="relative mt-2">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#475569]" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="ms-input pl-10"
                  data-testid="login-password"
                  required
                />
              </div>
              <div className="mt-2 text-right">
                <button
                  type="button"
                  onClick={() => setForgotOpen(true)}
                  className="text-xs font-semibold text-[#3BA4FF] hover:underline"
                  data-testid="forgot-password-link"
                >
                  Mot de passe oublié&nbsp;?
                </button>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            data-testid="login-btn"
            className="ms-btn-primary w-full mt-6 !py-3 disabled:opacity-60"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                Connexion…
              </span>
            ) : (
              <>
                <LogIn className="h-4 w-4" /> Se connecter <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>

          <p className="mt-6 text-center text-xs text-[#475569]">
            Connexion sécurisée · SSO MS Group · MS Park © 2026
          </p>
        </form>
      </div>

      {forgotOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          data-testid="forgot-password-modal"
          onClick={() => setForgotOpen(false)}
        >
          <div className="absolute inset-0 bg-[#071B34]/70 backdrop-blur-md" />
          <div
            className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md p-7"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#3BA4FF]/12 text-[#1D70B8]">
              <Mail className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-center text-lg font-extrabold text-[#071B34]">
              Mot de passe oublié&nbsp;?
            </h3>
            <p className="mt-3 text-center text-sm text-[#475569] leading-relaxed">
              Envoyez un message à <a href="mailto:support@mspark.fr?subject=Mot%20de%20passe%20oubli%C3%A9%20-%20Intranet%20MS%20Park" className="font-semibold text-[#1D70B8] underline">support@mspark.fr</a>{" "}
              (Service Web &amp; IT). L&apos;équipe vous répondra dans les plus brefs délais pour réinitialiser votre accès.
            </p>
            <div className="mt-6 flex gap-2">
              <button
                onClick={() => setForgotOpen(false)}
                data-testid="forgot-modal-close"
                className="flex-1 rounded-xl bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#334155] text-sm font-semibold py-2.5 transition-colors"
              >
                Fermer
              </button>
              <a
                href="mailto:support@mspark.fr?subject=Mot%20de%20passe%20oubli%C3%A9%20-%20Intranet%20MS%20Park"
                data-testid="forgot-modal-mailto"
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#3BA4FF] hover:bg-[#1D70B8] text-white text-sm font-semibold py-2.5 transition-colors"
              >
                <Mail className="h-4 w-4" /> Envoyer un mail
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
