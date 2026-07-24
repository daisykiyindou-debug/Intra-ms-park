import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Users, UserPlus, Search, MoreVertical, Edit3, KeyRound, Ban, CheckCircle2, Copy, X, Save,
  ShieldCheck, Mail,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";
import { notifyLiveRefresh } from "@/hooks/useLiveData";

const ROLES = [
  { k: "employe", l: "Employé" },
  { k: "manager", l: "Manager" },
  { k: "rh", l: "RH" },
  { k: "communication", l: "Communication" },
  { k: "comptabilite", l: "Comptabilité" },
  { k: "direction", l: "Direction" },
  { k: "superadmin", l: "Super Admin" },
];

const STATUSES_OPT = [
  { k: "ops", l: "Employé terrain (OPS)" },
  { k: "management", l: "Management" },
  { k: "bureau", l: "Employé Bureau" },
  { k: "direction", l: "Direction" },
  { k: "alternant", l: "Alternant" },
  { k: "stage", l: "Stage" },
];

const DEPARTMENTS = [
  "Communication et Marketing", "RH", "Événementiel", "OPS",
  "Web & IT", "Relation clientèle", "Commercial",
  "Directions et opérations", "Managers",
];

const CONTRACT_TYPES = ["CDI", "CDD", "Alternance", "Stage", "Intérim"];
const CATEGORIES = ["Employé", "Agent de maîtrise", "Cadre"];
const HOURS = ["24h", "28h", "35h", "39h"];

const PERMISSIONS = [
  { k: "publish_news", l: "Publier des actualités" },
  { k: "edit_news", l: "Modifier les actualités" },
  { k: "manage_carousel", l: "Gérer le carrousel" },
  { k: "manage_newsletter", l: "Gérer les newsletters" },
  { k: "create_events", l: "Créer des événements" },
  { k: "edit_events", l: "Modifier les événements" },
  { k: "manage_documents", l: "Gérer les documents" },
  { k: "view_payslips", l: "Voir les fiches de paie" },
  { k: "publish_documents", l: "Publier des documents" },
  { k: "create_forms", l: "Créer des formulaires" },
  { k: "view_tickets", l: "Voir les tickets support" },
  { k: "reply_tickets", l: "Répondre aux tickets" },
  { k: "manage_users", l: "Gérer les utilisateurs" },
  { k: "approve_leaves", l: "Valider les congés" },
  { k: "approve_recovery", l: "Valider les récupérations" },
  { k: "view_expenses", l: "Voir les notes de frais" },
  { k: "approve_expenses", l: "Valider les notes de frais" },
  { k: "export_data", l: "Exporter les données" },
  { k: "view_stats", l: "Accès aux statistiques" },
  { k: "full_admin", l: "Administration complète" },
  { k: "add_gallery", l: "Ajouter dans la galerie photo" },
];

const STATUS_BADGE = {
  active: { l: "Actif", bg: "#D1FAE5", color: "#065F46" },
  suspended: { l: "Suspendu", bg: "#FEF3C7", color: "#B45309" },
  deactivated: { l: "Désactivé", bg: "#FEE2E2", color: "#B91C1C" },
};

export default function UserManager() {
  const { me } = useApp();
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [editing, setEditing] = useState(null); // "new" | user obj
  const [tempPasswordModal, setTempPasswordModal] = useState(null);

  const load = async () => {
    const { data } = await api.get("/admin/users");
    setUsers(data);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return users.filter((u) => {
      if (filterRole !== "all" && u.admin_role !== filterRole) return false;
      if (filterStatus !== "all" && (u.account_status || "active") !== filterStatus) return false;
      if (search) {
        const s = search.toLowerCase();
        const hay = `${u.first_name} ${u.last_name} ${u.email} ${u.personal_email || ""} ${u.role || ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [users, search, filterRole, filterStatus]);

  const stats = useMemo(() => {
    const active = users.filter((u) => (u.account_status || "active") === "active").length;
    const suspended = users.filter((u) => u.account_status === "suspended").length;
    const admins = users.filter((u) => u.is_admin).length;
    const deactivated = users.filter((u) => u.account_status === "deactivated").length;
    return { active, suspended, admins, deactivated };
  }, [users]);

  const setStatus = async (u, s) => {
    await api.post(`/admin/users/${u.id}/status`, { account_status: s });
    toast.success("Statut mis à jour");
    load();
  };

  const resetPassword = async (u) => {
    if (!window.confirm(`Réinitialiser le mot de passe de ${u.first_name} ${u.last_name} ?`)) return;
    const { data } = await api.post(`/admin/users/${u.id}/reset-password`);
    toast.success(`Nouveau mot de passe : ${data.temp_password}`, { duration: 15000 });
    setTempPasswordModal({ user: u, password: data.temp_password });
  };

  const deleteUser = async (u) => {
    if (!window.confirm(`Supprimer définitivement le compte ${u.first_name} ${u.last_name} ?`)) return;
    try {
      await api.delete(`/admin/users/${u.id}`);
      toast.success("Utilisateur supprimé");
      load();
      notifyLiveRefresh(["users"]);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Suppression impossible");
    }
  };

  if (!me?.is_admin) {
    return (
      <div className="ms-card p-8 text-center">
        <ShieldCheck className="h-10 w-10 mx-auto text-[#EF4444] mb-3" />
        <h3 className="text-lg font-bold text-[#071B34]">Accès restreint</h3>
        <p className="text-sm text-[#475569] mt-1">Ce module est réservé aux administrateurs.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 ms-fade-up">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <div className="ms-overline flex items-center gap-1">
            <Users className="h-3 w-3" /> Administration › Utilisateurs
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[#071B34] mt-1">
            Utilisateurs
          </h1>
          <p className="text-sm text-[#475569] mt-1">
            Gérez les comptes et les accès des utilisateurs de la plateforme.
          </p>
        </div>
        <button
          onClick={() => setEditing("new")}
          data-testid="user-create"
          className="ms-btn-primary"
        >
          <UserPlus className="h-4 w-4" />
          Ajouter un utilisateur
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <StatCard label="Utilisateurs actifs" value={stats.active} color="#3BA4FF" />
        <StatCard label="Suspendus" value={stats.suspended} color="#F59E0B" />
        <StatCard label="Administrateurs" value={stats.admins} color="#A78BFA" />
        <StatCard label="Désactivés" value={stats.deactivated} color="#EF4444" />
      </div>

      {/* Filters */}
      <div className="ms-card p-3 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8]" />
          <input
            data-testid="user-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un utilisateur…"
            className="ms-input pl-9"
          />
        </div>
        <select
          data-testid="filter-role"
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
          className="ms-input max-w-[180px]"
        >
          <option value="all">Tous les rôles</option>
          {ROLES.map((r) => <option key={r.k} value={r.k}>{r.l}</option>)}
        </select>
        <select
          data-testid="filter-status"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="ms-input max-w-[160px]"
        >
          <option value="all">Tous les statuts</option>
          <option value="active">Actifs</option>
          <option value="suspended">Suspendus</option>
          <option value="deactivated">Désactivés</option>
        </select>
      </div>

      {/* Table */}
      <div className="ms-card overflow-hidden">
        <div className="hidden md:grid grid-cols-[2fr_1.5fr_1.2fr_1fr_1fr_60px] gap-3 px-4 py-3 bg-[#F4F7FA] text-[10px] uppercase tracking-wider text-[#475569] font-bold">
          <div>Utilisateur</div>
          <div>Fonction / Service</div>
          <div>Rôle</div>
          <div>Statut</div>
          <div>Matricule</div>
          <div className="text-right">Actions</div>
        </div>
        <div className="divide-y divide-[#071B34]/5">
          {filtered.length === 0 && (
            <div className="p-8 text-center text-sm text-[#475569]">
              Aucun utilisateur ne correspond aux filtres.
            </div>
          )}
          {filtered.map((u) => (
            <UserRow
              key={u.id}
              user={u}
              onEdit={() => setEditing(u)}
              onStatus={setStatus}
              onReset={resetPassword}
              onDelete={deleteUser}
            />
          ))}
        </div>
        <div className="px-4 py-3 border-t border-[#071B34]/5 flex items-center justify-between text-xs text-[#475569]">
          <span>{filtered.length} utilisateur{filtered.length > 1 ? "s" : ""} affiché{filtered.length > 1 ? "s" : ""} sur {users.length}</span>
        </div>
      </div>

      {editing && (
        <UserEditor
          user={editing === "new" ? null : editing}
          employees={users}
          onClose={() => setEditing(null)}
          onSaved={async (created) => {
            setEditing(null);
            setSearch(""); // Clear any active search filter so the new user is visible
            setFilterRole("all");
            setFilterStatus("all");
            await load();
            notifyLiveRefresh(["users"]);
            if (created?.temp_password) {
              setTempPasswordModal({
                user: created.user,
                password: created.temp_password,
                isNew: true,
              });
            }
          }}
        />
      )}

      {tempPasswordModal && (
        <TempPasswordModal
          data={tempPasswordModal}
          onClose={() => {
            setTempPasswordModal(null);
            load(); // Force refresh to ensure newly-created user is visible in the table
          }}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className="ms-card p-4">
      <div className="text-[10px] uppercase tracking-wider text-[#475569] font-bold">{label}</div>
      <div className="text-3xl font-extrabold mt-1" style={{ color }}>{value}</div>
    </div>
  );
}

function UserRow({ user, onEdit, onStatus, onReset, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const status = user.account_status || "active";
  const meta = STATUS_BADGE[status] || STATUS_BADGE.active;
  const role = ROLES.find((r) => r.k === (user.admin_role || "employe"))?.l || "Employé";

  return (
    <div className="grid md:grid-cols-[2fr_1.5fr_1.2fr_1fr_1fr_60px] gap-3 items-center px-4 py-3 hover:bg-[#F4F7FA]/60 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <img src={user.avatar} alt="" className="h-10 w-10 rounded-full object-cover ring-2 ring-white shadow-sm" />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[#071B34] truncate">
            {user.first_name} {user.last_name}
          </div>
          <div className="text-xs text-[#475569] truncate">{user.email}</div>
        </div>
      </div>
      <div className="text-xs text-[#475569] min-w-0">
        <div className="font-semibold text-[#071B34] truncate">{user.role || "—"}</div>
        <div className="truncate">{user.department || "—"}</div>
      </div>
      <div>
        <span className="ms-chip bg-[#3BA4FF]/12 text-[#1D70B8] !text-[11px]">{role}</span>
      </div>
      <div>
        <span className="ms-chip !text-[11px]" style={{ background: meta.bg, color: meta.color }}>
          {meta.l}
        </span>
      </div>
      <div className="text-xs text-[#475569] truncate">{user.matricule || "—"}</div>
      <div className="text-right relative">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          data-testid={`row-menu-${user.id}`}
          className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[#071B34]/5"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
        {menuOpen && (
          <>
            <button className="fixed inset-0 z-40 cursor-default" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 mt-1 z-50 w-52 rounded-xl bg-white shadow-xl border border-[#071B34]/5 py-1 text-sm">
              <MenuBtn onClick={() => { setMenuOpen(false); onEdit(); }} icon={Edit3} label="Modifier" testid={`edit-${user.id}`} />
              <MenuBtn onClick={() => { setMenuOpen(false); onReset(user); }} icon={KeyRound} label="Réinit. mot de passe" testid={`reset-${user.id}`} />
              {status !== "active" && (
                <MenuBtn onClick={() => { setMenuOpen(false); onStatus(user, "active"); }} icon={CheckCircle2} label="Réactiver" testid={`activate-${user.id}`} />
              )}
              {status !== "suspended" && (
                <MenuBtn onClick={() => { setMenuOpen(false); onStatus(user, "suspended"); }} icon={Ban} label="Suspendre" testid={`suspend-${user.id}`} />
              )}
              {status !== "deactivated" && (
                <MenuBtn onClick={() => { setMenuOpen(false); onStatus(user, "deactivated"); }} icon={Ban} label="Désactiver" testid={`deactivate-${user.id}`} />
              )}
              <div className="my-1 border-t border-[#071B34]/5" />
              <MenuBtn onClick={() => { setMenuOpen(false); onDelete(user); }} icon={X} label="Supprimer" testid={`delete-${user.id}`} danger />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MenuBtn({ icon: Icon, label, onClick, testid, danger }) {
  return (
    <button
      onClick={onClick}
      data-testid={testid}
      className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-[#F4F7FA] transition-colors ${
        danger ? "text-[#B91C1C]" : "text-[#071B34]"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function TempPasswordModal({ data, onClose }) {
  return createPortal(
    <div
      role="dialog"
      onClick={onClose}
      className="fixed inset-0 z-[110] bg-black/50 backdrop-blur-md flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="ms-card max-w-md w-full p-6 text-center"
      >
        <div className="mx-auto h-12 w-12 rounded-full bg-[#10B981]/15 flex items-center justify-center">
          <KeyRound className="h-6 w-6 text-[#10B981]" />
        </div>
        <h3 className="text-lg font-bold text-[#071B34] mt-3">
          {data.isNew ? "Utilisateur créé" : "Mot de passe réinitialisé"}
        </h3>
        <p className="text-sm text-[#475569] mt-1">
          Communiquez ce mot de passe temporaire à <strong>{data.user.first_name} {data.user.last_name}</strong>.
          Il devra le changer à sa première connexion.
        </p>
        <div className="mt-4 rounded-xl bg-[#F4F7FA] p-3 flex items-center justify-between gap-2">
          <code className="font-mono text-lg font-bold text-[#071B34]" data-testid="temp-password-value">{data.password}</code>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(data.password);
                toast.success("Copié !");
              } catch {
                // Fallback for browsers/contexts that block clipboard API
                const ta = document.createElement("textarea");
                ta.value = data.password;
                document.body.appendChild(ta);
                ta.select();
                try { document.execCommand("copy"); toast.success("Copié !"); }
                catch { toast.info("Copiez manuellement : " + data.password); }
                document.body.removeChild(ta);
              }
            }}
            className="flex items-center gap-1 rounded-lg bg-[#3BA4FF] text-white text-xs font-semibold px-2.5 py-1.5"
          >
            <Copy className="h-3 w-3" />
            Copier
          </button>
        </div>
        <button onClick={onClose} className="ms-btn-primary mt-4 w-full">Fermer</button>
      </div>
    </div>,
    document.body
  );
}

// ─────────────────────────────────────────────────────
// Editor
function UserEditor({ user, employees, onClose, onSaved }) {
  const isNew = !user;
  const [tab, setTab] = useState("account");
  const [f, setF] = useState({
    first_name: "",
    last_name: "",
    birth_date: "",
    email: "",
    personal_email: "",
    phone: "",
    personal_phone: "",
    address: "",
    postal_code: "",
    city: "",
    country: "France",
    avatar: "",
    force_password_change: true,
    account_status: "active",
    statuses: [],
    department: "",
    role: "",
    manager_id: "",
    contract_type: "CDI",
    weekly_hours: "35h",
    hire_date: "",
    contract_end_date: "",
    category: "Employé",
    badge_rfid: "",
    badge_expiry: "",
    badge_active: true,
    locker: "",
    work_days: [],
    off_days: [],
    usual_hours: "",
    break_time: "",
    gross_salary: "",
    net_salary: "",
    hourly_rate: "",
    iban: "",
    bic: "",
    account_holder: "",
    meal_points: "",
    contract_url: "",
    contract_name: "",
    admin_role: "employe",
    permissions: [],
    groups: [],
    role_category: "employe",
    ...user,
  });
  const [saving, setSaving] = useState(false);

  const togglePerm = (k) => setF((s) => ({
    ...s,
    permissions: s.permissions.includes(k)
      ? s.permissions.filter((x) => x !== k)
      : [...s.permissions, k],
  }));

  const toggleStatus = (k) => setF((s) => ({
    ...s,
    statuses: s.statuses.includes(k) ? s.statuses.filter((x) => x !== k) : [...s.statuses, k],
  }));

  const submit = async (e) => {
    e.preventDefault();
    if (!f.first_name || !f.last_name || !f.personal_email || !f.personal_phone) {
      toast.error("Champs obligatoires manquants (Prénom, Nom, Email personnel, Téléphone personnel)");
      return;
    }
    setSaving(true);
    try {
      const payload = { ...f };
      // Convert numeric strings
      ["gross_salary", "net_salary", "hourly_rate", "meal_points"].forEach((k) => {
        if (payload[k] === "" || payload[k] == null) payload[k] = null;
        else payload[k] = Number(payload[k]);
      });
      if (isNew) {
        const { data } = await api.post("/admin/users", payload);
        toast.success("Utilisateur créé");
        onSaved(data);
      } else {
        await api.put(`/admin/users/${user.id}`, payload);
        toast.success("Utilisateur mis à jour");
        onSaved(null);
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Erreur");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100]"
    >
      <button
        aria-label="Fermer"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-md w-full h-full cursor-default"
      />
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="absolute inset-3 md:inset-6 lg:inset-8 rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col"
        data-testid="user-editor"
      >
        {/* Header */}
        <div className="shrink-0 px-5 py-4 border-b border-[#071B34]/5 flex items-center justify-between">
          <div>
            <div className="ms-overline">{isNew ? "Nouvel utilisateur" : "Modifier l'utilisateur"}</div>
            <h2 className="text-lg font-bold text-[#071B34] mt-0.5">
              {f.first_name} {f.last_name}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[#071B34]/5">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="shrink-0 px-5 pt-3 border-b border-[#071B34]/5 flex gap-1 overflow-x-auto">
          {[
            ["account", "1. Compte"],
            ["hr", "2. RH"],
            ["planning", "3. Planning"],
            ["payroll", "4. Paie"],
            ["access", "5. Accès"],
          ].map(([k, l]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              data-testid={`tab-${k}`}
              className={`px-4 py-2 text-xs font-bold rounded-t-lg transition-colors ${
                tab === k ? "bg-[#3BA4FF]/10 text-[#1D70B8]" : "text-[#475569] hover:bg-[#F4F7FA]"
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5">
          {tab === "account" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-1 flex flex-col items-center">
                <img
                  src={f.avatar || "https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=200&h=200&fit=crop"}
                  alt=""
                  className="h-24 w-24 rounded-full object-cover ring-4 ring-white shadow-md"
                />
                <label className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#3BA4FF] text-white text-xs font-semibold px-3 py-1.5 cursor-pointer hover:bg-[#1D70B8]">
                  <Copy className="h-3 w-3" /> Téléverser une photo
                  <input
                    type="file"
                    accept="image/*"
                    data-testid="user-avatar-file"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const fd = new FormData();
                      fd.append("file", file);
                      try {
                        const { data } = await api.post("/uploads", fd, {
                          headers: { "Content-Type": "multipart/form-data" },
                        });
                        setF({ ...f, avatar: data.url });
                        toast.success("Photo téléversée");
                      } catch {
                        toast.error("Échec du téléversement");
                      }
                    }}
                  />
                </label>
                <input
                  data-testid="user-avatar"
                  value={f.avatar}
                  onChange={(e) => setF({ ...f, avatar: e.target.value })}
                  placeholder="ou coller une URL"
                  className="ms-input mt-2 text-xs"
                />
              </div>
              <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Prénom *" testid="first_name" value={f.first_name} onChange={(v) => setF({ ...f, first_name: v })} required />
                <Field label="Nom *" testid="last_name" value={f.last_name} onChange={(v) => setF({ ...f, last_name: v })} required />
                <Field label="Date de naissance" type="date" testid="birth_date" value={f.birth_date} onChange={(v) => setF({ ...f, birth_date: v })} />
                <Field label="Matricule badge" testid="matricule" value={f.matricule || ""} onChange={(v) => setF({ ...f, matricule: v })} placeholder="Auto-généré si vide" />
                <Field label="Email pro" testid="email" value={f.email} onChange={(v) => setF({ ...f, email: v })} />
                <Field label="Email perso *" testid="personal_email" value={f.personal_email} onChange={(v) => setF({ ...f, personal_email: v })} required />
                <Field label="Téléphone pro" testid="phone" value={f.phone} onChange={(v) => setF({ ...f, phone: v })} />
                <Field label="Téléphone perso *" testid="personal_phone" value={f.personal_phone} onChange={(v) => setF({ ...f, personal_phone: v })} required />
                <Field className="md:col-span-2" label="Adresse" testid="address" value={f.address} onChange={(v) => setF({ ...f, address: v })} />
                <Field label="Code postal" testid="postal_code" value={f.postal_code} onChange={(v) => setF({ ...f, postal_code: v })} />
                <Field label="Ville" testid="city" value={f.city} onChange={(v) => setF({ ...f, city: v })} />
                <Field label="Pays" testid="country" value={f.country} onChange={(v) => setF({ ...f, country: v })} />
                {isNew && (
                  <Field label="Mot de passe temporaire" testid="temp_password" value={f.temp_password || ""} onChange={(v) => setF({ ...f, temp_password: v })} placeholder="Auto-généré si vide" />
                )}
                <div className="md:col-span-2 flex items-center gap-2 mt-1">
                  <input type="checkbox" id="fpc" checked={f.force_password_change} onChange={(e) => setF({ ...f, force_password_change: e.target.checked })} className="h-4 w-4 accent-[#3BA4FF]" />
                  <label htmlFor="fpc" className="text-sm text-[#071B34]">Obliger le changement du mot de passe à la première connexion</label>
                </div>
                <SelectField label="Statut du compte" testid="account_status" value={f.account_status} onChange={(v) => setF({ ...f, account_status: v })} options={[
                  ["active", "Actif"], ["suspended", "Suspendu"], ["deactivated", "Désactivé"],
                ]} />
              </div>
            </div>
          )}

          {tab === "hr" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="ms-overline">Statut (multi-sélection)</label>
                <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2">
                  {STATUSES_OPT.map((s) => (
                    <label key={s.k} className={`rounded-lg border p-2 flex items-center gap-2 cursor-pointer text-xs ${f.statuses.includes(s.k) ? "border-[#3BA4FF] bg-[#3BA4FF]/8" : "border-[#071B34]/10"}`}>
                      <input type="checkbox" checked={f.statuses.includes(s.k)} onChange={() => toggleStatus(s.k)} className="h-3.5 w-3.5 accent-[#3BA4FF]" />
                      {s.l}
                    </label>
                  ))}
                </div>
              </div>
              <SelectField label="Département" testid="department" value={f.department} onChange={(v) => setF({ ...f, department: v })} options={[["", "— Aucun —"], ...DEPARTMENTS.map((d) => [d, d])]} />
              <Field label="Poste" testid="role" value={f.role} onChange={(v) => setF({ ...f, role: v })} />
              <SelectField label="Manager" testid="manager_id" value={f.manager_id} onChange={(v) => setF({ ...f, manager_id: v })} options={[["", "— Aucun —"], ...employees.filter((e) => e.id !== user?.id).map((e) => [e.id, `${e.first_name} ${e.last_name}`])]} />
              <SelectField label="Type de contrat" testid="contract_type" value={f.contract_type} onChange={(v) => setF({ ...f, contract_type: v })} options={CONTRACT_TYPES.map((c) => [c, c])} />
              <SelectField label="Temps de travail" testid="weekly_hours" value={f.weekly_hours} onChange={(v) => setF({ ...f, weekly_hours: v })} options={HOURS.map((h) => [h, h])} />
              <SelectField label="Catégorie" testid="category" value={f.category} onChange={(v) => setF({ ...f, category: v })} options={CATEGORIES.map((c) => [c, c])} />
              <Field label="Date d'embauche" type="date" testid="hire_date" value={f.hire_date} onChange={(v) => setF({ ...f, hire_date: v })} />
              <Field label="Date fin contrat" type="date" testid="contract_end_date" value={f.contract_end_date} onChange={(v) => setF({ ...f, contract_end_date: v })} />
              <Field label="Badge RFID / NFC" testid="badge_rfid" value={f.badge_rfid} onChange={(v) => setF({ ...f, badge_rfid: v })} />
              <Field label="Casier attribué" testid="locker" value={f.locker} onChange={(v) => setF({ ...f, locker: v })} />
              <Field label="Expiration du badge" type="date" testid="badge_expiry" value={f.badge_expiry} onChange={(v) => setF({ ...f, badge_expiry: v })} />
              <div className="flex items-center gap-2 pt-6">
                <input type="checkbox" id="badge-active" checked={f.badge_active !== false} onChange={(e) => setF({ ...f, badge_active: e.target.checked })} data-testid="badge_active" className="h-4 w-4 accent-[#3BA4FF]" />
                <label htmlFor="badge-active" className="text-sm text-[#071B34]">Badge actif</label>
              </div>
              <div className="md:col-span-2">
                <label className="ms-overline">Contrat de travail (PDF)</label>
                <label className="mt-2 flex items-center gap-3 rounded-xl border-2 border-dashed border-[#3BA4FF]/40 bg-[#3BA4FF]/5 p-4 cursor-pointer hover:bg-[#3BA4FF]/10 transition-colors">
                  <input
                    type="file"
                    accept="application/pdf,.pdf,.doc,.docx"
                    data-testid="contract-file"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const fd = new FormData();
                      fd.append("file", file);
                      try {
                        const { data } = await api.post("/uploads", fd, {
                          headers: { "Content-Type": "multipart/form-data" },
                        });
                        setF({ ...f, contract_url: data.url, contract_name: file.name });
                        toast.success("Contrat téléversé — il apparaîtra dans Documents RH");
                      } catch {
                        toast.error("Échec du téléversement");
                      }
                    }}
                  />
                  <Copy className="h-5 w-5 text-[#3BA4FF]" />
                  <div className="flex-1 text-sm">
                    {f.contract_url ? (
                      <span className="font-semibold text-[#071B34]">{f.contract_name || "Contrat téléversé"} ✓</span>
                    ) : (
                      <span className="text-[#475569]">Cliquez pour joindre le contrat (PDF)</span>
                    )}
                  </div>
                </label>
              </div>
            </div>
          )}

          {tab === "planning" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="ms-overline">Jours travaillés</label>
                <div className="mt-2 grid grid-cols-4 md:grid-cols-7 gap-2">
                  {["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((d, i) => (
                    <label key={d} className={`rounded-lg border p-2 text-center cursor-pointer text-xs ${f.work_days.includes(d) ? "border-[#3BA4FF] bg-[#3BA4FF]/8" : "border-[#071B34]/10"}`}>
                      <input type="checkbox" checked={f.work_days.includes(d)} onChange={() => setF((s) => ({ ...s, work_days: s.work_days.includes(d) ? s.work_days.filter((x) => x !== d) : [...s.work_days, d] }))} className="hidden" />
                      {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"][i]}
                    </label>
                  ))}
                </div>
              </div>
              <Field label="Horaires habituels" testid="usual_hours" value={f.usual_hours} onChange={(v) => setF({ ...f, usual_hours: v })} placeholder="Ex. 9h-17h" />
              <Field label="Temps de pause" testid="break_time" value={f.break_time} onChange={(v) => setF({ ...f, break_time: v })} placeholder="Ex. 12h-13h" />
            </div>
          )}

          {tab === "payroll" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Salaire brut (€)" type="number" testid="gross_salary" value={f.gross_salary} onChange={(v) => setF({ ...f, gross_salary: v })} />
              <Field label="Salaire net estimé (€)" type="number" testid="net_salary" value={f.net_salary} onChange={(v) => setF({ ...f, net_salary: v })} />
              <Field label="Taux horaire (€)" type="number" testid="hourly_rate" value={f.hourly_rate} onChange={(v) => setF({ ...f, hourly_rate: v })} />
              <Field label="Points repas / jour" type="number" testid="meal_points" value={f.meal_points} onChange={(v) => setF({ ...f, meal_points: v })} placeholder="Auto: Bureau=35 · Management=30 · OPS=25" />
              <Field className="md:col-span-2" label="IBAN" testid="iban" value={f.iban} onChange={(v) => setF({ ...f, iban: v })} placeholder="FR76 ..." />
              <Field label="BIC" testid="bic" value={f.bic} onChange={(v) => setF({ ...f, bic: v })} />
              <Field label="Titulaire du compte" testid="account_holder" value={f.account_holder} onChange={(v) => setF({ ...f, account_holder: v })} />
            </div>
          )}

          {tab === "access" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <SelectField label="Rôle" testid="admin_role" value={f.admin_role} onChange={(v) => setF({ ...f, admin_role: v })} options={ROLES.map((r) => [r.k, r.l])} />
                <Field label="Groupes (séparés par virgule)" testid="groups" value={f.groups.join(", ")} onChange={(v) => setF({ ...f, groups: v.split(",").map((x) => x.trim()).filter(Boolean) })} placeholder="Ex. Projets, Managers" />
              </div>
              <div>
                <label className="ms-overline">Permissions</label>
                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1.5">
                  {PERMISSIONS.map((p) => (
                    <label key={p.k} className="flex items-center gap-2 text-xs text-[#071B34] rounded-lg px-2 py-1.5 hover:bg-[#F4F7FA] cursor-pointer">
                      <input type="checkbox" checked={f.permissions.includes(p.k)} onChange={() => togglePerm(p.k)} data-testid={`perm-${p.k}`} className="h-3.5 w-3.5 accent-[#3BA4FF]" />
                      {p.l}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-3 border-t border-[#071B34]/5 flex justify-between items-center bg-white">
          <div className="text-xs text-[#475569] flex items-center gap-1">
            {isNew && <><Mail className="h-3 w-3" /> Un mot de passe temporaire sera généré si laissé vide</>}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="ms-btn-outline">Annuler</button>
            <button type="submit" disabled={saving} data-testid="user-save" className="ms-btn-primary disabled:opacity-50">
              <Save className="h-4 w-4" />
              {saving ? "Enregistrement…" : isNew ? "Créer l'utilisateur" : "Enregistrer"}
            </button>
          </div>
        </div>
      </form>
    </div>,
    document.body
  );
}

function Field({ label, value, onChange, type = "text", testid, placeholder, required, className }) {
  return (
    <div className={className}>
      <label className="ms-overline">{label}</label>
      <input
        type={type}
        data-testid={testid}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="ms-input mt-2"
      />
    </div>
  );
}

function SelectField({ label, value, onChange, options, testid, className }) {
  return (
    <div className={className}>
      <label className="ms-overline">{label}</label>
      <select
        data-testid={testid}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="ms-input mt-2"
      >
        {options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
    </div>
  );
}
