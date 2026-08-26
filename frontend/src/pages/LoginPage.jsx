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
        <div className="relative flex items-center gap-4">
          <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-white/10 backdrop-blur-md border border-white/15 shadow-xl shadow-[#3BA4FF]/25 p-2.5">
            <img
              src={MS_PARK_LOGO}
              alt="MS Park"
              className="h-full w-full object-contain"
              data-testid="login-brand-logo"
            />
          </div>
          <div>
            <div className="text-3xl font-extrabold tracking-tight leading-none">MS Park</div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-white/50 mt-1.5">Intranet</div>
          </div>
        </div>
        <div className="relative mt-16 md:mt-32 max-w-md">
          <div className="text-xs uppercase tracking-[0.2em] text-[#3BA4FF] font-semibold">
            Bienvenue sur l'intranet
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
            Connectez-vous avec votre identifiant MS Park pour accéder à l'intranet.
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
                <a
                  href="mailto:support@mspark.fr?subject=Mot%20de%20passe%20oubli%C3%A9%20-%20Intranet%20MS%20Park"
                  className="text-xs font-semibold text-[#3BA4FF] hover:underline"
                  data-testid="forgot-password-link"
                >
                  Mot de passe oublié ? Envoyer un mail à support@mspark.fr (Service Web &amp; IT)
                </a>
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
    </div>
  );
}
