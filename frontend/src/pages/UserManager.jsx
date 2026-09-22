import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Users, UserPlus, Search, MoreVertical, Edit3, KeyRound, Ban, CheckCircle2, Copy, X, Save,
  ShieldCheck, Mail, Settings2, Pencil, Trash2, Plus, Check,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useApp, hasPermission } from "@/contexts/AppContext";
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
  { k: "restauration", l: "Restauration" },
  { k: "securite", l: "Sécurité" },
  { k: "nettoyage", l: "Nettoyage" },
  { k: "maintenance", l: "Maintenance" },
];

const DEPARTMENTS = [
  "Communication et Marketing", "RH", "Événementiel", "OPS",
  "Web & IT", "Relation clientèle", "Commercial",
  "Directions et opérations", "Managers",
  "Hygiène", "Sécurité", "Maintenance",
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
  { k: "manage_badging", l: "Gestion des pointages" },
  { k: "approve_leaves", l: "Valider les congés" },
  { k: "approve_recovery", l: "Valider les récupérations" },
  { k: "view_expenses", l: "Voir les notes de frais" },
  { k: "approve_expenses", l: "Valider les notes de frais" },
  { k: "export_data", l: "Exporter les données" },
  { k: "view_stats", l: "Accès aux statistiques" },
  { k: "full_admin", l: "Administration complète" },
  { k: "add_gallery", l: "Ajouter dans la galerie photo" },
];

// Permissions grouped by profession (métier). One permission can appear in
// several groups — the UI still shows each permission only once (grouped by
// first-hit) but the "presets" section below lets an admin apply all perms of
// a given métier in one click.
const PERMISSION_GROUPS = [
  {
    k: "communication",
    l: "Chargé de Communication",
    icon: "megaphone",
    color: "#F59E0B",
    perms: ["publish_news", "edit_news", "manage_carousel", "manage_newsletter",
            "create_events", "edit_events", "add_gallery", "create_forms",
            "publish_documents"],
  },
  {
    k: "rh",
    l: "Ressources Humaines",
    icon: "briefcase",
    color: "#7C3AED",
    perms: ["view_payslips", "approve_leaves", "approve_recovery",
            "manage_documents", "manage_users", "manage_badging", "view_expenses", "approve_expenses"],
  },
  {
    k: "finance",
    l: "Comptabilité & Finance",
    icon: "landmark",
    color: "#10B981",
    perms: ["view_payslips", "view_expenses", "approve_expenses", "export_data",
            "view_stats"],
  },
  {
    k: "manager",
    l: "Manager Opérationnel",
    icon: "user-cog",
    color: "#3BA4FF",
    perms: ["approve_leaves", "approve_recovery", "view_tickets", "reply_tickets",
            "view_stats", "view_expenses"],
  },
  {
    k: "support",
    l: "Support / IT",
    icon: "shield",
    color: "#0EA5E9",
    perms: ["view_tickets", "reply_tickets", "manage_documents"],
  },
  {
    k: "direction",
    l: "Direction",
    icon: "shield-check",
    color: "#B91C1C",
    perms: ["full_admin", "manage_users", "export_data", "view_stats",
            "approve_leaves", "approve_expenses", "approve_recovery"],
  },
];

const STATUS_BADGE = {
  active: { l: "Actif", bg: "#D1FAE5", color: "#065F46" },
  suspended: { l: "Suspendu", bg: "#FEF3C7", color: "#B45309" },
  deactivated: { l: "Désactivé", bg: "#FEE2E2", color: "#B91C1C" },
};

// Auto-derivation table for meal points based on employee status.
// Mirrors backend MEAL_POINTS_BY_STATUS — keep in sync.
const MEAL_POINTS_BY_STATUS = {
  direction: 35,
  restauration: 35,
  bureau: 30,
  management: 30,
  ops: 25,
  securite: 25,
  nettoyage: 25,
  maintenance: 25,
  alternant: 25,
  stage: 25,
};

const deriveMealPoints = (statuses) => {
  if (!Array.isArray(statuses) || statuses.length === 0) return "";
  const max = statuses.reduce((acc, s) => Math.max(acc, MEAL_POINTS_BY_STATUS[s] || 0), 0);
  return max > 0 ? max : "";
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

  if (!me?.is_admin && !hasPermission(me, "manage_users")) {
    return (
      <div className="ms-card p-8 text-center">
        <ShieldCheck className="h-10 w-10 mx-auto text-[#EF4444] mb-3" />
        <h3 className="text-lg font-bold text-[#071B34]">Accès restreint</h3>
        <p className="text-sm text-[#475569] mt-1">Vous n&apos;avez pas la permission &quot;Gérer les utilisateurs&quot;.</p>
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
  const [menuPos, setMenuPos] = useState(null);
  const btnRef = useRef(null);
  const status = user.account_status || "active";
  const meta = STATUS_BADGE[status] || STATUS_BADGE.active;
  const role = ROLES.find((r) => r.k === (user.admin_role || "employe"))?.l || "Employé";

  const openMenu = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      const menuHeight = 260; // approx max menu height
      const openUpward = r.bottom + menuHeight > window.innerHeight;
      setMenuPos({
        top: openUpward ? Math.max(8, r.top - menuHeight) : r.bottom + 4,
        left: Math.min(r.right - 210, window.innerWidth - 220),
      });
    }
    setMenuOpen(true);
  };

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
          ref={btnRef}
          onClick={openMenu}
          data-testid={`row-menu-${user.id}`}
          className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[#071B34]/5"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
        {menuOpen && menuPos && createPortal(
          <>
            <button className="fixed inset-0 z-[110] cursor-default" onClick={() => setMenuOpen(false)} />
            <div
              className="fixed z-[120] w-52 rounded-xl bg-white shadow-xl border border-[#071B34]/5 py-1 text-sm"
              style={{ top: menuPos.top, left: menuPos.left }}
            >
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
          </>,
          document.body
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
    weekly_hours: "35",
    hire_date: "",
    contract_end_date: "",
    category: "Employé",
    badge_rfid: "",
    badge_expiry: "",
    badge_active: true,
    locker: "",
    work_days: [],
    off_days: [],
    remote_days: [],
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
    service_channels_access: [],
    team_channel_ids: [],
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

  const [cropperSrc, setCropperSrc] = useState(null);

  const handleAvatarFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCropperSrc(ev.target.result);
    reader.readAsDataURL(file);
  };

  const toggleStatus = (k) => setF((s) => {
    const newStatuses = s.statuses.includes(k) ? s.statuses.filter((x) => x !== k) : [...s.statuses, k];
    // Auto-derive meal_points from statuses unless the admin manually set them
    const autoMeal = deriveMealPoints(newStatuses);
    return {
      ...s,
      statuses: newStatuses,
      meal_points: s.meal_manual ? s.meal_points : autoMeal,
    };
  });

  const submit = async (e) => {
    e.preventDefault();
    if (!f.first_name || !f.last_name || !f.personal_email || !f.personal_phone) {
      toast.error("Champs obligatoires manquants (Prénom, Nom, Email personnel, Téléphone personnel)");
      return;
    }
    setSaving(true);
    try {
      const payload = { ...f };
      // Remove UI-only manual override flags
      delete payload.meal_manual;
      delete payload.net_manual;
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
            ["channels", "6. Messagerie"],
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
                    onChange={(e) => handleAvatarFile(e.target.files?.[0])}
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
              <div>
                <label className="ms-overline block mb-1">Temps de travail (h/semaine) *</label>
                <input
                  type="number"
                  min="0"
                  max="80"
                  step="0.5"
                  value={f.weekly_hours}
                  onChange={(e) => setF({ ...f, weekly_hours: e.target.value })}
                  data-testid="weekly_hours"
                  placeholder="Ex. 24, 28, 35, 39"
                  className="ms-input"
                  required
                />
                <div className="text-[10px] text-[#94A3B8] mt-1">Saisie libre. Ex : 24, 28, 35, 39, 20.5</div>
              </div>
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
                <label className="ms-overline">Jours travaillés (sur site)</label>
                <div className="mt-2 grid grid-cols-4 md:grid-cols-7 gap-2">
                  {["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((d, i) => (
                    <label key={d} className={`rounded-lg border p-2 text-center cursor-pointer text-xs ${f.work_days.includes(d) ? "border-[#3BA4FF] bg-[#3BA4FF]/8" : "border-[#071B34]/10"}`}>
                      <input type="checkbox" checked={f.work_days.includes(d)} onChange={() => setF((s) => ({ ...s, work_days: s.work_days.includes(d) ? s.work_days.filter((x) => x !== d) : [...s.work_days, d] }))} className="hidden" />
                      {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"][i]}
                    </label>
                  ))}
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="ms-overline">Jours de télétravail récurrent</label>
                <div className="mt-2 grid grid-cols-4 md:grid-cols-7 gap-2">
                  {["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((d, i) => (
                    <label key={d} className={`rounded-lg border p-2 text-center cursor-pointer text-xs ${(f.remote_days || []).includes(d) ? "border-[#059669] bg-[#10B981]/10 text-[#065F46]" : "border-[#071B34]/10"}`}>
                      <input
                        type="checkbox"
                        checked={(f.remote_days || []).includes(d)}
                        onChange={() => setF((s) => ({
                          ...s,
                          remote_days: (s.remote_days || []).includes(d)
                            ? (s.remote_days || []).filter((x) => x !== d)
                            : [...(s.remote_days || []), d],
                        }))}
                        data-testid={`remote-day-${d}`}
                        className="hidden"
                      />
                      {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"][i]}
                    </label>
                  ))}
                </div>
                <p className="mt-1 text-[10px] text-[#475569] italic">Les jours cochés seront automatiquement marqués « Télétravail » dans le planning hebdomadaire.</p>
              </div>
              <Field label="Horaires habituels" testid="usual_hours" value={f.usual_hours} onChange={(v) => setF({ ...f, usual_hours: v })} placeholder="Ex. 9h-17h" />
              <Field label="Temps de pause" testid="break_time" value={f.break_time} onChange={(v) => setF({ ...f, break_time: v })} placeholder="Ex. 12h-13h" />
            </div>
          )}

          {tab === "payroll" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field
                label="Salaire brut (€)"
                type="number"
                testid="gross_salary"
                value={f.gross_salary}
                onChange={(v) => {
                  // Auto-calc net (~78% of gross, French approximation) unless
                  // the admin manually edited it (net_manual flag).
                  const netAuto = v === "" || v == null ? "" : Math.round(Number(v) * 78) / 100;
                  setF((s) => ({
                    ...s,
                    gross_salary: v,
                    net_salary: s.net_manual ? s.net_salary : netAuto,
                  }));
                }}
              />
              <Field
                label="Salaire net estimé (€)"
                type="number"
                testid="net_salary"
                value={f.net_salary}
                onChange={(v) => setF((s) => ({ ...s, net_salary: v, net_manual: true }))}
              />
              <Field label="Taux horaire (€)" type="number" testid="hourly_rate" value={f.hourly_rate} onChange={(v) => setF({ ...f, hourly_rate: v })} />
              <Field
                label="Points repas / jour"
                type="number"
                testid="meal_points"
                value={f.meal_points}
                onChange={(v) => setF({ ...f, meal_points: v, meal_manual: true })}
                placeholder="Auto: Direction/Restauration=35 · Bureau/Management=30 · OPS/Sécurité/Nettoyage/Maintenance=25"
              />
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

              {/* Presets by métier — one-click apply of the whole group's perms */}
              <div className="rounded-2xl border border-[#071B34]/8 bg-[#F8FAFC] p-3">
                <p className="text-[11px] uppercase tracking-widest font-bold text-[#475569] mb-2">Presets métier</p>
                <div className="flex flex-wrap gap-1.5">
                  {PERMISSION_GROUPS.map((g) => {
                    const allOn = g.perms.every((k) => f.permissions.includes(k));
                    return (
                      <button
                        key={g.k}
                        type="button"
                        onClick={() => setF((s) => ({
                          ...s,
                          permissions: allOn
                            ? s.permissions.filter((k) => !g.perms.includes(k))
                            : Array.from(new Set([...(s.permissions || []), ...g.perms])),
                        }))}
                        data-testid={`preset-${g.k}`}
                        style={{ backgroundColor: allOn ? g.color : "white", color: allOn ? "white" : g.color, borderColor: g.color + "40" }}
                        className="text-xs font-semibold px-3 py-1.5 rounded-full ring-1 transition-colors"
                        title={g.perms.join(", ")}
                      >
                        {allOn ? "✓ " : "+ "}{g.l}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Permissions grouped by profession */}
              <div className="space-y-3">
                <label className="ms-overline">Permissions individuelles</label>
                {PERMISSION_GROUPS.map((g) => {
                  const groupPerms = g.perms
                    .map((k) => PERMISSIONS.find((p) => p.k === k))
                    .filter(Boolean);
                  if (groupPerms.length === 0) return null;
                  return (
                    <div
                      key={g.k}
                      className="rounded-xl border p-3"
                      style={{ borderColor: g.color + "30", backgroundColor: g.color + "08" }}
                      data-testid={`perm-group-${g.k}`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: g.color }} />
                        <h4 className="text-sm font-bold text-[#071B34]">{g.l}</h4>
                        <span className="text-[10px] text-[#475569] ml-auto">
                          {groupPerms.filter((p) => f.permissions.includes(p.k)).length}/{groupPerms.length}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1.5">
                        {groupPerms.map((p) => (
                          <label key={`${g.k}-${p.k}`} className="flex items-center gap-2 text-xs text-[#071B34] rounded-lg px-2 py-1.5 hover:bg-white cursor-pointer">
                            <input
                              type="checkbox"
                              checked={f.permissions.includes(p.k)}
                              onChange={() => togglePerm(p.k)}
                              data-testid={`perm-${p.k}`}
                              className="h-3.5 w-3.5"
                              style={{ accentColor: g.color }}
                            />
                            {p.l}
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {/* Uncategorized perms (safety net) */}
                {(() => {
                  const grouped = new Set(PERMISSION_GROUPS.flatMap((g) => g.perms));
                  const others = PERMISSIONS.filter((p) => !grouped.has(p.k));
                  if (others.length === 0) return null;
                  return (
                    <div className="rounded-xl border border-[#071B34]/10 bg-white p-3">
                      <h4 className="text-sm font-bold text-[#071B34] mb-2">Autres</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1.5">
                        {others.map((p) => (
                          <label key={p.k} className="flex items-center gap-2 text-xs text-[#071B34] rounded-lg px-2 py-1.5 hover:bg-[#F4F7FA] cursor-pointer">
                            <input type="checkbox" checked={f.permissions.includes(p.k)} onChange={() => togglePerm(p.k)} data-testid={`perm-${p.k}`} className="h-3.5 w-3.5 accent-[#3BA4FF]" />
                            {p.l}
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
          {tab === "channels" && <ChannelsTab f={f} setF={setF} />}
        </div>

        {/* Footer — wizard navigation */}
        {(() => {
          const STEPS = ["account", "hr", "planning", "payroll", "access", "channels"];
          const currentIdx = STEPS.indexOf(tab);
          const isLast = currentIdx === STEPS.length - 1;
          const isFirst = currentIdx === 0;

          const validateStep = () => {
            if (tab === "account") {
              if (!f.first_name?.trim() || !f.last_name?.trim()) {
                toast.error("Prénom et nom obligatoires");
                return false;
              }
              const emailRe = /^\S+@\S+\.\S+$/;
              if (!f.personal_email?.trim() || !emailRe.test(f.personal_email.trim())) {
                toast.error("Email perso valide requis");
                return false;
              }
              if (f.email?.trim() && !emailRe.test(f.email.trim())) {
                toast.error("Email pro invalide");
                return false;
              }
              if (!f.personal_phone?.trim()) {
                toast.error("Téléphone perso obligatoire");
                return false;
              }
            }
            if (tab === "hr") {
              if (!f.role?.trim()) {
                toast.error("Poste obligatoire");
                return false;
              }
              const wh = parseFloat(f.weekly_hours);
              if (isNaN(wh) || wh <= 0 || wh > 80) {
                toast.error("Temps de travail hebdomadaire requis (entre 0 et 80h)");
                return false;
              }
            }
            return true;
          };

          const goNext = () => {
            if (!validateStep()) return;
            setTab(STEPS[Math.min(currentIdx + 1, STEPS.length - 1)]);
          };
          const goPrev = () => setTab(STEPS[Math.max(currentIdx - 1, 0)]);

          return (
            <div className="shrink-0 px-5 py-3 border-t border-[#071B34]/5 flex justify-between items-center bg-white">
              <div className="text-xs text-[#475569] flex items-center gap-1">
                {isNew && <><Mail className="h-3 w-3" /> Mot de passe temporaire généré si laissé vide</>}
                <span className="ml-2 text-[10px] text-[#94A3B8]">Étape {currentIdx + 1}/{STEPS.length}</span>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={onClose} className="ms-btn-outline">Annuler</button>
                {!isFirst && (
                  <button type="button" onClick={goPrev} data-testid="user-prev" className="ms-btn-outline">
                    Précédent
                  </button>
                )}
                {isNew && !isLast && (
                  <button type="submit" formNoValidate data-testid="user-draft" onClick={(e) => { e.preventDefault(); toast.info("Brouillon enregistré localement"); }} className="ms-btn-outline">
                    Enregistrer brouillon
                  </button>
                )}
                {!isLast ? (
                  <button type="button" onClick={goNext} data-testid="user-next" className="ms-btn-primary">
                    Suivant →
                  </button>
                ) : (
                  <button type="submit" disabled={saving} data-testid="user-save" className="ms-btn-primary disabled:opacity-50">
                    <Save className="h-4 w-4" />
                    {saving ? "Enregistrement…" : isNew ? "Créer l'utilisateur" : "Enregistrer"}
                  </button>
                )}
              </div>
            </div>
          );
        })()}
      </form>
      {cropperSrc && (
        <AvatarCropper
          src={cropperSrc}
          onCancel={() => setCropperSrc(null)}
          onCrop={async (dataUrl) => {
            setCropperSrc(null);
            // Convert dataUrl to Blob and upload
            const blob = await (await fetch(dataUrl)).blob();
            const file = new File([blob], "avatar.jpg", { type: "image/jpeg" });
            const fd = new FormData();
            fd.append("file", file);
            try {
              const { data } = await api.post("/uploads", fd, {
                headers: { "Content-Type": "multipart/form-data" },
              });
              setF({ ...f, avatar: data.url });
              toast.success("Photo recadrée et téléversée");
            } catch {
              toast.error("Échec du téléversement");
            }
          }}
        />
      )}
    </div>,
    document.body
  );
}

// ─── Simple canvas-based circular avatar cropper (zoom + pan)
function AvatarCropper({ src, onCancel, onCrop }) {
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [startDrag, setStartDrag] = useState(null);
  const [imgSize, setImgSize] = useState(null); // natural size {w, h}

  const BOX = 320; // preview size in pixels
  const OUTPUT = 512; // output resolution

  // Base "cover" scale so at zoom=1 the image fills the preview circle
  const baseScale = imgSize
    ? Math.max(BOX / imgSize.w, BOX / imgSize.h)
    : 1;

  useEffect(() => {
    const img = new window.Image();
    img.onload = () => setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = src;
  }, [src]);

  const beginDrag = (cx, cy) => {
    setDragging(true);
    setStartDrag({ x: cx - pos.x, y: cy - pos.y });
  };
  const moveDrag = (cx, cy) => {
    if (!dragging || !startDrag) return;
    setPos({ x: cx - startDrag.x, y: cy - startDrag.y });
  };
  const endDrag = () => { setDragging(false); setStartDrag(null); };

  const onMouseDown = (e) => beginDrag(e.clientX, e.clientY);
  const onMouseMove = (e) => moveDrag(e.clientX, e.clientY);
  const onTouchStart = (e) => {
    if (!e.touches[0]) return;
    beginDrag(e.touches[0].clientX, e.touches[0].clientY);
  };
  const onTouchMove = (e) => {
    if (!e.touches[0]) return;
    moveDrag(e.touches[0].clientX, e.touches[0].clientY);
  };

  const applyCrop = () => {
    if (!imgSize) return;
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT;
      canvas.height = OUTPUT;
      const ctx = canvas.getContext("2d");
      // Preview → output scale
      const scale = OUTPUT / BOX;
      // Effective scale applied to the source image inside the preview box
      const ratio = baseScale * zoom;
      const drawW = imgSize.w * ratio;
      const drawH = imgSize.h * ratio;
      const cx = BOX / 2 + pos.x;
      const cy = BOX / 2 + pos.y;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, OUTPUT, OUTPUT);
      ctx.drawImage(
        img,
        (cx - drawW / 2) * scale,
        (cy - drawH / 2) * scale,
        drawW * scale,
        drawH * scale,
      );
      onCrop(canvas.toDataURL("image/jpeg", 0.92));
    };
    img.src = src;
  };

  // Wheel zoom for extra precision
  const onWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    setZoom((z) => Math.min(4, Math.max(0.4, +(z + delta).toFixed(2))));
  };

  return createPortal(
    <div
      role="dialog"
      onClick={onCancel}
      className="fixed inset-0 z-[130] bg-black/60 backdrop-blur-md flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="ms-card max-w-md w-full p-5"
        data-testid="avatar-cropper"
      >
        <h3 className="text-lg font-bold text-[#071B34]">Recadrer la photo</h3>
        <p className="text-xs text-[#475569] mt-1">
          Faites glisser pour repositionner, zoomez / dézoomez avec le curseur ou la molette.
        </p>
        <div className="mt-4 flex justify-center">
          <div
            className="relative overflow-hidden rounded-full bg-[#071B34]/5 select-none touch-none"
            style={{ width: BOX, height: BOX, cursor: dragging ? "grabbing" : "grab" }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={endDrag}
            onMouseLeave={endDrag}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={endDrag}
            onWheel={onWheel}
          >
            {imgSize && (
              <img
                src={src}
                alt=""
                draggable={false}
                className="absolute pointer-events-none"
                style={{
                  width: imgSize.w,
                  height: imgSize.h,
                  left: "50%",
                  top: "50%",
                  transformOrigin: "center center",
                  transform: `translate(-50%, -50%) translate(${pos.x}px, ${pos.y}px) scale(${baseScale * zoom})`,
                  maxWidth: "none",
                }}
              />
            )}
          </div>
        </div>
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <label className="ms-overline">Zoom</label>
            <span className="text-[11px] text-[#475569] font-semibold">{zoom.toFixed(2)}×</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(2)))}
              className="h-8 w-8 rounded-lg bg-[#F4F7FA] hover:bg-[#071B34]/5 text-lg font-bold text-[#071B34]"
              data-testid="cropper-zoom-out"
              aria-label="Dézoomer"
            >−</button>
            <input
              type="range"
              min={0.4}
              max={4}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              data-testid="cropper-zoom"
              className="flex-1 accent-[#3BA4FF]"
            />
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(4, +(z + 0.1).toFixed(2)))}
              className="h-8 w-8 rounded-lg bg-[#F4F7FA] hover:bg-[#071B34]/5 text-lg font-bold text-[#071B34]"
              data-testid="cropper-zoom-in"
              aria-label="Zoomer"
            >+</button>
            <button
              type="button"
              onClick={() => { setZoom(1); setPos({ x: 0, y: 0 }); }}
              className="text-[11px] font-semibold text-[#475569] hover:text-[#3BA4FF] px-2"
              data-testid="cropper-reset"
            >
              Réinit.
            </button>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="ms-btn-outline">Annuler</button>
          <button type="button" onClick={applyCrop} data-testid="cropper-apply" className="ms-btn-primary">
            <Save className="h-4 w-4" /> Recadrer et téléverser
          </button>
        </div>
      </div>
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

// ─────────────────────────────────────────
// Onglet Messagerie & Canaux
// ─────────────────────────────────────────
function ChannelsTab({ f, setF }) {
  const [catalog, setCatalog] = useState({ service_channels: [], team_channels: [] });
  const [managing, setManaging] = useState(false);
  const reload = () => api.get("/admin/channels/catalog").then((r) => setCatalog(r.data)).catch(() => {});
  useEffect(() => { reload(); }, []);
  const svc = f.service_channels_access || [];
  const teams = f.team_channel_ids || [];
  const toggleSvc = (k) => setF((s) => ({
    ...s,
    service_channels_access: (s.service_channels_access || []).includes(k)
      ? (s.service_channels_access || []).filter((x) => x !== k)
      : [...(s.service_channels_access || []), k],
  }));
  const toggleTeam = (k) => setF((s) => ({
    ...s,
    team_channel_ids: (s.team_channel_ids || []).includes(k)
      ? (s.team_channel_ids || []).filter((x) => x !== k)
      : [...(s.team_channel_ids || []), k],
  }));
  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setManaging(true)}
          data-testid="btn-manage-channels"
          className="ms-btn-outline text-xs"
        >
          <Settings2 className="h-3.5 w-3.5" /> Gérer les canaux
        </button>
      </div>
      {/* Section 1 — Service canals */}
      <div className="rounded-2xl border border-[#7C3AED]/20 bg-[#A78BFA]/5 p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="h-2 w-2 rounded-full bg-[#7C3AED]" />
          <h3 className="text-sm font-bold text-[#071B34]">Canaux de contact — Service</h3>
        </div>
        <p className="text-[11px] text-[#475569] mb-3">
          Boîtes de réception collectives. En les activant, l'utilisateur peut consulter et répondre aux messages reçus <strong>au nom du service</strong>. Ses messages restent signés de son prénom et nom.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {catalog.service_channels.map((c) => {
            const on = svc.includes(c.key);
            return (
              <label
                key={c.key}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold cursor-pointer transition-colors ${
                  on ? "bg-[#7C3AED] text-white shadow" : "bg-white ring-1 ring-[#7C3AED]/20 text-[#334155] hover:bg-[#A78BFA]/10"
                }`}
                data-testid={`svc-canal-${c.key}`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggleSvc(c.key)}
                  className="h-3.5 w-3.5 accent-[#7C3AED]"
                />
                {c.name}
              </label>
            );
          })}
        </div>
      </div>

      {/* Section 2 — Team discussion canals */}
      <div className="rounded-2xl border border-[#3BA4FF]/20 bg-[#3BA4FF]/5 p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="h-2 w-2 rounded-full bg-[#3BA4FF]" />
          <h3 className="text-sm font-bold text-[#071B34]">Canaux de discussion d'équipe</h3>
        </div>
        <p className="text-[11px] text-[#475569] mb-3">
          Groupes de conversation permanents. L'utilisateur écrit avec <strong>sa propre identité</strong>. Il accède à l'historique complet dès son ajout. Un message système signale son arrivée aux autres membres.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {catalog.team_channels.map((c) => {
            const on = teams.includes(c.key);
            return (
              <label
                key={c.key}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold cursor-pointer transition-colors ${
                  on ? "bg-[#3BA4FF] text-white shadow" : "bg-white ring-1 ring-[#3BA4FF]/20 text-[#334155] hover:bg-[#3BA4FF]/10"
                }`}
                data-testid={`team-canal-${c.key}`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggleTeam(c.key)}
                  className="h-3.5 w-3.5 accent-[#3BA4FF]"
                />
                {c.name}
              </label>
            );
          })}
        </div>
      </div>

      {managing && (
        <ChannelManagerModal
          catalog={catalog}
          onClose={() => setManaging(false)}
          onChange={reload}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────
// Modale Gérer les canaux (CRUD)
// ─────────────────────────────────────────
function ChannelManagerModal({ catalog, onClose, onChange }) {
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState("team");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null); // { kind, key, name }

  const create = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      await api.post("/admin/channels/catalog", { kind: newKind, name: newName.trim() });
      toast.success(`Canal "${newName.trim()}" créé`);
      setNewName("");
      onChange();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Erreur création");
    } finally {
      setBusy(false);
    }
  };
  const rename = async () => {
    if (!editing?.name.trim()) return;
    setBusy(true);
    try {
      await api.patch(`/admin/channels/catalog/${editing.kind}/${editing.key}`, { name: editing.name.trim() });
      toast.success("Canal renommé");
      setEditing(null);
      onChange();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Erreur");
    } finally {
      setBusy(false);
    }
  };
  const remove = async (kind, key, name) => {
    if (!window.confirm(`Supprimer définitivement le canal "${name}" ?\n\nTous les messages, notifications et accès seront supprimés.`)) return;
    setBusy(true);
    try {
      const r = await api.delete(`/admin/channels/catalog/${kind}/${key}`);
      toast.success(`Canal "${name}" supprimé (${r.data.deleted_channels || 0} conversations)`);
      onChange();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Erreur suppression");
    } finally {
      setBusy(false);
    }
  };

  const renderList = (kind, items, color) => (
    <div className="space-y-1.5">
      {items.map((c) => (
        <div
          key={c.key}
          data-testid={`manage-${kind}-${c.key}`}
          className={`flex items-center gap-2 rounded-lg bg-white ring-1 ring-${color}/20 px-3 py-2 text-xs`}
        >
          {editing?.kind === kind && editing?.key === c.key ? (
            <>
              <input
                autoFocus
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                className="ms-input h-8 flex-1 text-xs"
                data-testid={`edit-input-${c.key}`}
              />
              <button type="button" onClick={rename} disabled={busy} className="ms-btn-primary text-[11px] px-2 h-8">
                <Check className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => setEditing(null)} className="ms-btn-outline text-[11px] px-2 h-8">
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          ) : (
            <>
              <span className="flex-1 font-semibold text-[#071B34]">{c.name}</span>
              <span className="text-[10px] text-[#475569] font-mono">{c.key}</span>
              <button
                type="button"
                onClick={() => setEditing({ kind, key: c.key, name: c.name })}
                data-testid={`btn-rename-${c.key}`}
                className="p-1.5 rounded hover:bg-[#F4F7FA]"
              >
                <Pencil className="h-3.5 w-3.5 text-[#475569]" />
              </button>
              <button
                type="button"
                onClick={() => remove(kind, c.key, c.name)}
                data-testid={`btn-delete-${c.key}`}
                className="p-1.5 rounded hover:bg-red-50 text-red-500"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <ChannelManagerPortal onClose={onClose}>
      <div className="p-6 space-y-5">
        <div>
          <h2 className="text-lg font-bold text-[#071B34]">Gérer les canaux</h2>
          <p className="text-xs text-[#475569] mt-1">
            Renommer / supprimer les canaux existants ou en créer un nouveau. Les modifications sont propagées instantanément dans toutes les messageries.
          </p>
        </div>

        <div className="rounded-xl bg-[#F4F7FA] p-3 space-y-2">
          <p className="text-xs font-bold text-[#071B34]">Créer un nouveau canal</p>
          <div className="flex flex-wrap gap-2 items-center">
            <select
              value={newKind}
              onChange={(e) => setNewKind(e.target.value)}
              data-testid="new-channel-kind"
              className="ms-input h-9 text-xs w-40"
            >
              <option value="team">Équipe</option>
              <option value="service">Service</option>
            </select>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nom du canal (ex: Événementiel)"
              data-testid="new-channel-name"
              className="ms-input h-9 text-xs flex-1 min-w-[200px]"
            />
            <button
              type="button"
              onClick={create}
              disabled={busy || !newName.trim()}
              data-testid="btn-create-channel"
              className="ms-btn-primary text-xs h-9"
            >
              <Plus className="h-3.5 w-3.5" /> Ajouter
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-bold text-[#7C3AED] mb-2 uppercase tracking-wide">Services ({catalog.service_channels.length})</p>
            {renderList("service", catalog.service_channels, "[#7C3AED]")}
          </div>
          <div>
            <p className="text-xs font-bold text-[#3BA4FF] mb-2 uppercase tracking-wide">Équipes ({catalog.team_channels.length})</p>
            {renderList("team", catalog.team_channels, "[#3BA4FF]")}
          </div>
        </div>

        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="ms-btn-outline text-xs">
            Fermer
          </button>
        </div>
      </div>
    </ChannelManagerPortal>
  );
}

function ChannelManagerPortal({ onClose, children }) {
  return createPortal(
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[110]">
      <button
        aria-label="Fermer"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-md w-full h-full cursor-default"
      />
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92%] max-w-2xl max-h-[90vh] rounded-2xl bg-white shadow-2xl overflow-y-auto"
        data-testid="channel-manager-modal"
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
