import { useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  Mail, Phone, Award, BadgeCheck, Sparkles, Edit3, Save, X, LogOut, Home, KeyRound, MapPin,
  UserCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/contexts/AppContext";
import { api, setAuthId } from "@/lib/api";

export default function Profil() {
  const { me, employees } = useApp();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [pwOpen, setPwOpen] = useState(false);

  if (!me) return <div className="ms-card p-8 animate-pulse h-64" />;
  const years = (me.seniority_months / 12).toFixed(1);

  const managerObj = me.manager_id
    ? (employees || []).find((e) => e.id === me.manager_id)
    : null;
  const managerName = managerObj
    ? `${managerObj.first_name} ${managerObj.last_name}`
    : me.manager || "—";

  const fullAddress = [
    me.address,
    [me.postal_code, me.city].filter(Boolean).join(" "),
    me.country,
  ].filter(Boolean).join(" · ");

  const startEdit = () => {
    setForm({
      personal_email: me.personal_email || "",
      phone: me.phone || "",
      address: me.address || "",
    });
    setEditing(true);
  };

  const save = async () => {
    await api.put("/me", form);
    toast.success("Profil mis à jour");
    setEditing(false);
    window.location.reload();
  };

  const logout = () => {
    setAuthId(null);
    navigate("/login");
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
                <Award className="h-3 w-3" /> {years} ans d'ancienneté
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/8 backdrop-blur-md px-3 py-1.5 text-xs font-semibold">
                <BadgeCheck className="h-3 w-3" /> {me.matricule}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/8 backdrop-blur-md px-3 py-1.5 text-xs font-semibold">
                <Sparkles className="h-3 w-3" /> {me.daily_quota} pts repas/jour
              </span>
            </div>
          </div>
          <button
            onClick={logout}
            data-testid="logout"
            className="rounded-2xl bg-white/10 backdrop-blur-md hover:bg-white/20 px-4 py-2.5 text-sm font-semibold transition-colors flex items-center gap-2"
          >
            <LogOut className="h-4 w-4" />
            Déconnexion
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Contact block */}
        <div className="lg:col-span-7 ms-card p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-[#071B34]">Informations personnelles</h3>
            {!editing ? (
              <div className="flex gap-2">
                <button onClick={() => setPwOpen(true)} data-testid="open-change-password" className="ms-btn-outline text-xs">
                  <KeyRound className="h-3 w-3" /> Mot de passe
                </button>
                <button onClick={startEdit} data-testid="edit-profile" className="ms-btn-primary text-xs">
                  <Edit3 className="h-3 w-3" /> Modifier
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button onClick={() => setEditing(false)} className="ms-btn-ghost text-xs">
                  <X className="h-3 w-3" /> Annuler
                </button>
                <button onClick={save} data-testid="save-profile" className="ms-btn-primary text-xs">
                  <Save className="h-3 w-3" /> Enregistrer
                </button>
              </div>
            )}
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field
              icon={Mail}
              label="Email personnel"
              editable={editing}
              value={editing ? form.personal_email : me.personal_email}
              onChange={(v) => setForm({ ...form, personal_email: v })}
              testid="personal-email"
            />
            <Field
              icon={Mail}
              label="Email professionnel"
              value={me.email}
              testid="pro-email"
            />
            <Field
              icon={Phone}
              label="Téléphone personnel"
              editable={editing}
              value={editing ? form.phone : me.personal_phone || me.phone}
              onChange={(v) => setForm({ ...form, phone: v })}
              testid="personal-phone"
            />
            {me.phone && me.personal_phone && me.phone !== me.personal_phone && (
              <Field
                icon={Phone}
                label="Téléphone professionnel"
                value={me.phone}
                testid="pro-phone"
              />
            )}
            <Field
              icon={Home}
              label="Adresse"
              editable={editing}
              value={editing ? form.address : me.address}
              onChange={(v) => setForm({ ...form, address: v })}
              testid="address"
            />
            <Field
              icon={MapPin}
              label="Ville / Code postal"
              value={[me.postal_code, me.city, me.country].filter(Boolean).join(", ") || "—"}
              testid="city-postal"
            />
          </div>
        </div>

        {/* Skills + stats */}
        <div className="lg:col-span-5 ms-card p-6">
          <h3 className="text-lg font-bold text-[#071B34]">Poste & contrat</h3>
          <div className="mt-4 flex flex-wrap gap-2">
            {(me.skills || []).map((s) => (
              <span
                key={s}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#3BA4FF]/10 px-3 py-1.5 text-xs font-semibold text-[#1D70B8]"
              >
                {s}
              </span>
            ))}
          </div>
          <div className="mt-5 pt-5 border-t border-[#071B34]/5 grid grid-cols-2 gap-3">
            <KV label="Manager" value={managerName} icon={UserCircle2} testid="kv-manager" />
            <KV label="Contrat" value={me.weekly_hours ? `${me.weekly_hours} / semaine` : (me.contract_type || "—")} testid="kv-contract" />
            <KV label="Type de contrat" value={me.contract_type || "—"} />
            <KV label="Quota repas" value={`${me.daily_quota || 0} pts/jour`} />
            <KV label="Catégorie" value={me.category || me.role_category || "—"} />
            <KV label="Statuts" value={(me.statuses || []).join(", ") || "—"} />
          </div>
          {me.badge_rfid && (
            <div className="mt-4 pt-4 border-t border-[#071B34]/5 rounded-xl bg-[#F4F7FA] p-3">
              <div className="text-[10px] uppercase tracking-wider text-[#475569] font-semibold flex items-center gap-1">
                <BadgeCheck className="h-3 w-3" /> Badge
              </div>
              <div className="text-sm text-[#071B34] mt-1">
                {me.badge_rfid}
                {me.badge_expiry && <span className="text-[#475569] text-xs ml-2">· Expire le {me.badge_expiry}</span>}
                {me.badge_active === false && <span className="ms-chip bg-[#EF4444]/10 text-[#B91C1C] ml-2">Désactivé</span>}
              </div>
            </div>
          )}
        </div>
      </div>

      {pwOpen && <ChangePasswordModal onClose={() => setPwOpen(false)} />}
    </div>
  );
}

function ChangePasswordModal({ onClose }) {
  const [current, setCurrent] = useState("");
  const [next1, setNext1] = useState("");
  const [next2, setNext2] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (next1.length < 6) return toast.error("Le nouveau mot de passe doit contenir au moins 6 caractères");
    if (next1 !== next2) return toast.error("Les deux mots de passe ne correspondent pas");
    setSaving(true);
    try {
      await api.post("/me/change-password", { current_password: current, new_password: next1 });
      toast.success("Mot de passe mis à jour");
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Échec du changement");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      role="dialog"
      onClick={onClose}
      className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-md flex items-center justify-center p-4"
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="ms-card max-w-md w-full p-6"
        data-testid="change-password-modal"
      >
        <div className="flex items-center gap-2 mb-4">
          <KeyRound className="h-5 w-5 text-[#3BA4FF]" />
          <h3 className="text-lg font-bold text-[#071B34]">Changer mon mot de passe</h3>
        </div>
        <div className="space-y-3">
          <div>
            <label className="ms-overline">Mot de passe actuel</label>
            <input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              data-testid="current-password"
              className="ms-input mt-2"
              required
            />
          </div>
          <div>
            <label className="ms-overline">Nouveau mot de passe</label>
            <input
              type="password"
              value={next1}
              onChange={(e) => setNext1(e.target.value)}
              data-testid="new-password"
              className="ms-input mt-2"
              minLength={6}
              required
            />
          </div>
          <div>
            <label className="ms-overline">Confirmer</label>
            <input
              type="password"
              value={next2}
              onChange={(e) => setNext2(e.target.value)}
              data-testid="confirm-password"
              className="ms-input mt-2"
              minLength={6}
              required
            />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="ms-btn-outline">Annuler</button>
          <button type="submit" disabled={saving} data-testid="save-new-password" className="ms-btn-primary disabled:opacity-50">
            <Save className="h-4 w-4" /> {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}

function Field({ icon: Icon, label, value, editable, onChange, testid }) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-[#F4F7FA] p-3">
      {Icon && <Icon className="h-4 w-4 text-[#3BA4FF] mt-0.5" />}
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
          <div data-testid={testid} className="text-sm font-semibold text-[#071B34] mt-0.5 truncate">
            {value || "—"}
          </div>
        )}
      </div>
    </div>
  );
}

function KV({ label, value, icon: Icon, testid }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[#475569] font-semibold flex items-center gap-1">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </div>
      <div className="text-sm font-semibold text-[#071B34] mt-1" data-testid={testid}>{value}</div>
    </div>
  );
}
