import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, Phone, Award, BadgeCheck, Sparkles, Edit3, Save, X, LogOut, Home, AtSign } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/contexts/AppContext";
import { api, roleQuotaLabel } from "@/lib/api";

export default function Profil() {
  const { me } = useApp();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});

  if (!me) return <div className="ms-card p-8 animate-pulse h-64" />;
  const years = (me.seniority_months / 12).toFixed(1);

  const startEdit = () => {
    setForm({
      email: me.email,
      personal_email: me.personal_email,
      phone: me.phone,
      address: me.address,
    });
    setEditing(true);
  };

  const save = async () => {
    await api.put("/me", form);
    toast.success("Profil mis à jour");
    setEditing(false);
    window.location.reload();
  };

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
            <p className="mt-1 text-white/70">
              {me.role} · {me.department}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/8 backdrop-blur-md px-3 py-1.5 text-xs font-semibold">
                <Sparkles className="h-3 w-3 text-[#3BA4FF]" />
                {roleQuotaLabel(me.role_category)}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/8 backdrop-blur-md px-3 py-1.5 text-xs font-semibold">
                <Award className="h-3 w-3 text-[#F59E0B]" />
                {years} ans d'ancienneté
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#10B981]/15 px-3 py-1.5 text-xs font-semibold text-[#10B981]">
                <BadgeCheck className="h-3 w-3" />
                Badge {me.badge_number}
              </span>
            </div>
          </div>
          <button
            onClick={() => navigate("/login")}
            data-testid="logout-btn"
            className="inline-flex items-center gap-2 rounded-xl bg-white/8 backdrop-blur-md hover:bg-white/15 px-4 py-2.5 text-sm font-semibold text-white transition-colors"
          >
            <LogOut className="h-4 w-4" /> Se déconnecter
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Coordonnées */}
        <div className="lg:col-span-7 ms-card p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-[#071B34]">Coordonnées</h3>
            {!editing ? (
              <button
                onClick={startEdit}
                data-testid="edit-profile"
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#3BA4FF]/12 hover:bg-[#3BA4FF]/20 px-3 py-1.5 text-xs font-semibold text-[#1D70B8] transition-colors"
              >
                <Edit3 className="h-3 w-3" /> Modifier
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => setEditing(false)}
                  className="ms-btn-ghost text-xs"
                >
                  <X className="h-3 w-3" /> Annuler
                </button>
                <button onClick={save} data-testid="save-profile" className="ms-btn-primary text-xs">
                  <Save className="h-3 w-3" /> Enregistrer
                </button>
              </div>
            )}
          </div>

          <div className="mt-4 space-y-3">
            <Field
              icon={Mail}
              label="Email professionnel"
              editable={false}
              value={me.email}
            />
            <Field
              icon={AtSign}
              label="Email personnel"
              editable={editing}
              value={editing ? form.personal_email : me.personal_email}
              onChange={(v) => setForm({ ...form, personal_email: v })}
              testid="personal-email"
            />
            <Field
              icon={Phone}
              label="Téléphone"
              editable={editing}
              value={editing ? form.phone : me.phone}
              onChange={(v) => setForm({ ...form, phone: v })}
              testid="phone"
            />
            <Field
              icon={Home}
              label="Adresse postale"
              editable={editing}
              value={editing ? form.address : me.address}
              onChange={(v) => setForm({ ...form, address: v })}
              testid="address"
            />
          </div>
        </div>

        {/* Skills + stats */}
        <div className="lg:col-span-5 ms-card p-6">
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
          <div className="mt-5 pt-5 border-t border-[#071B34]/5 grid grid-cols-2 gap-3">
            <KV label="Manager" value={me.manager} />
            <KV label="Contrat" value="24h / semaine" />
            <KV label="Quota repas" value={`${me.daily_quota} pts/jour`} />
            <KV label="Catégorie" value={me.role_category} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ icon: Icon, label, value, editable, onChange, testid }) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-[#F4F7FA] p-3">
      <Icon className="h-4 w-4 text-[#3BA4FF] mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-[#475569] font-semibold">{label}</div>
        {editable ? (
          <input
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            data-testid={testid}
            className="mt-1 w-full bg-white rounded-lg border border-[#071B34]/10 px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-[#3BA4FF]/30 focus:border-[#3BA4FF] outline-none"
          />
        ) : (
          <div className="text-sm text-[#071B34] mt-0.5">{value}</div>
        )}
      </div>
    </div>
  );
}

function KV({ label, value }) {
  return (
    <div className="rounded-xl bg-gradient-to-br from-[#3BA4FF]/8 to-transparent p-3">
      <div className="text-[10px] uppercase tracking-wider text-[#475569] font-semibold">{label}</div>
      <div className="text-sm font-bold text-[#071B34] mt-0.5 capitalize">{value}</div>
    </div>
  );
}
