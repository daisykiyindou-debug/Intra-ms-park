import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, LogIn, Mail, Lock, ArrowRight } from "lucide-react";
import { toast } from "sonner";

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("idriss.malonga@gmail.com");
  const [password, setPassword] = useState("•••••••");
  const [loading, setLoading] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      localStorage.removeItem("ms_logged_out");
      toast.success("Connecté à MS Park");
      navigate("/dashboard");
    }, 700);
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#F4F7FA]">
      {/* Left: visual */}
      <div className="md:flex-1 relative overflow-hidden bg-gradient-to-br from-[#071B34] via-[#0B2545] to-[#071B34] text-white p-10 md:p-16 ms-grain">
        <div className="absolute -right-20 -top-20 h-96 w-96 rounded-full bg-[#3BA4FF]/30 blur-3xl" />
        <div className="absolute -left-10 bottom-10 h-64 w-64 rounded-full bg-[#3BA4FF]/15 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#3BA4FF] to-[#1D70B8] shadow-lg shadow-[#3BA4FF]/25">
            <Sparkles className="h-6 w-6 text-white" strokeWidth={2.5} />
          </div>
          <div>
            <div className="text-2xl font-extrabold tracking-tight leading-none">MS Park</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/50 mt-1">Intranet</div>
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

          <div className="mt-8 space-y-4">
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
                  required
                />
              </div>
              <div className="mt-2 text-right">
                <button type="button" className="text-xs font-semibold text-[#3BA4FF] hover:underline">
                  Mot de passe oublié ?
                </button>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            data-testid="login-btn"
            className="ms-btn-primary w-full mt-8 !py-3 disabled:opacity-60"
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
