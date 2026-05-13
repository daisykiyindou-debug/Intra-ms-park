import { Mail, Phone, MapPin, Award, Sparkles, Clock, ShieldCheck, BadgeCheck } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { roleQuotaLabel } from "@/lib/api";

export default function Profil() {
  const { me } = useApp();
  if (!me) return <div className="ms-card p-8 animate-pulse h-64" />;

  const years = (me.seniority_months / 12).toFixed(1);

  return (
    <div className="space-y-6 ms-fade-up">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#071B34] via-[#0B2545] to-[#071B34] p-8 md:p-10 text-white ms-grain">
        <div className="absolute -right-10 -top-10 h-64 w-64 rounded-full bg-[#3BA4FF]/20 blur-3xl" />
        <div className="relative flex flex-col md:flex-row items-start md:items-center gap-6">
          <img
            src={me.avatar}
            alt={me.first_name}
            className="h-28 w-28 rounded-2xl object-cover ring-4 ring-white/10 shadow-xl"
          />
          <div className="flex-1">
            <div className="text-xs uppercase tracking-[0.2em] text-[#3BA4FF] font-semibold">
              Mon profil
            </div>
            <h1 className="mt-1 text-3xl md:text-4xl font-bold tracking-tight">
              {me.first_name} {me.last_name}
            </h1>
            <p className="mt-1 text-white/70">{me.role} · {me.department}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/8 backdrop-blur-md px-3 py-1.5 text-xs font-semibold">
                <Sparkles className="h-3 w-3 text-[#3BA4FF]" /> {roleQuotaLabel(me.role_category)}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/8 backdrop-blur-md px-3 py-1.5 text-xs font-semibold">
                <Award className="h-3 w-3 text-[#F59E0B]" /> {years} ans d'ancienneté
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#10B981]/15 px-3 py-1.5 text-xs font-semibold text-[#10B981]">
                <BadgeCheck className="h-3 w-3" /> Badge actif
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Coordonnées */}
        <div className="lg:col-span-5 ms-card p-6">
          <h3 className="text-lg font-bold text-[#071B34]">Coordonnées</h3>
          <div className="mt-4 space-y-3">
            <Row icon={Mail} label="Email" value={me.email} />
            <Row icon={Phone} label="Téléphone" value={me.phone} />
            <Row icon={MapPin} label="Lieu" value={me.location} />
            <Row icon={ShieldCheck} label="Manager" value={me.manager} />
          </div>
        </div>

        {/* Skills */}
        <div className="lg:col-span-7 ms-card p-6">
          <h3 className="text-lg font-bold text-[#071B34]">Compétences</h3>
          <div className="mt-4 flex flex-wrap gap-2">
            {me.skills?.map((s) => (
              <span
                key={s}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#3BA4FF]/10 px-4 py-2 text-sm font-semibold text-[#1D70B8]"
              >
                {s}
              </span>
            ))}
          </div>

          <div className="mt-6 grid grid-cols-2 md:grid-cols-3 gap-3">
            <Stat label="Quota repas" value={`${me.daily_quota} pts`} hint="par jour travaillé" />
            <Stat label="Contrat" value="24h / semaine" hint="CDI temps partiel" />
            <Stat label="Catégorie" value={me.role_category?.[0].toUpperCase() + me.role_category?.slice(1)} hint="Grille MS Park" />
          </div>
        </div>
      </div>

      <div className="ms-card p-6">
        <h3 className="text-lg font-bold text-[#071B34]">Préférences & activité</h3>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="rounded-xl bg-[#F4F7FA] p-4">
            <div className="text-[10px] uppercase tracking-wider text-[#475569] font-semibold">
              Notifications
            </div>
            <p className="mt-2 text-[#071B34]">
              Toutes les notifications RH, planning et messages sont activées par défaut.
            </p>
          </div>
          <div className="rounded-xl bg-[#F4F7FA] p-4">
            <div className="text-[10px] uppercase tracking-wider text-[#475569] font-semibold">
              Activité récente
            </div>
            <p className="mt-2 text-[#071B34]">
              Dernière connexion · aujourd'hui · 12 commandes ce mois.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-[#F4F7FA] p-3">
      <Icon className="h-4 w-4 text-[#3BA4FF] mt-0.5" />
      <div>
        <div className="text-[10px] uppercase tracking-wider text-[#475569] font-semibold">{label}</div>
        <div className="text-sm text-[#071B34] mt-0.5">{value}</div>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }) {
  return (
    <div className="rounded-xl bg-gradient-to-br from-[#3BA4FF]/8 to-transparent p-4">
      <div className="text-[10px] uppercase tracking-wider text-[#475569] font-semibold">{label}</div>
      <div className="text-lg font-bold text-[#071B34] mt-1">{value}</div>
      <div className="text-xs text-[#475569] mt-0.5">{hint}</div>
    </div>
  );
}
