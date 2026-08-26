import { useEffect, useMemo, useState } from "react";
import { Search, Mail, Phone, MessageSquare, Users, Briefcase, UserCog, Utensils, Shield, Wrench, Info, Landmark, Megaphone, ChevronLeft, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";

const iconMap = {
  "users-round": Users,
  "user-cog": UserCog,
  briefcase: Briefcase,
  utensils: Utensils,
  shield: Shield,
  wrench: Wrench,
  landmark: Landmark,
  megaphone: Megaphone,
};

// Employees with these statuses / role categories do NOT get access to the
// "Tous les employés" directory tab.
const RESTRICTED_STATUSES = new Set(["ops", "manager", "securite", "maintenance", "nettoyage"]);
function canSeeAllEmployees(me) {
  if (!me) return false;
  if (me.is_admin || me.is_super_admin) return true;
  const statuses = (me.statuses || []).map((s) => String(s).toLowerCase());
  if (statuses.some((s) => RESTRICTED_STATUSES.has(s))) return false;
  return true;
}

export default function Contacts() {
  const { me, employees } = useApp();
  const [poles, setPoles] = useState([]);
  const [q, setQ] = useState("");
  const canDirectory = canSeeAllEmployees(me);
  const [tab, setTab] = useState("poles");
  const navigate = useNavigate();
  // Force back to "poles" if a restricted user somehow lands on "employees"
  useEffect(() => { if (!canDirectory && tab === "employees") setTab("poles"); }, [canDirectory, tab]);

  useEffect(() => {
    api.get("/poles").then((r) => setPoles(r.data));
  }, []);

  const openServiceChat = async (canalKey) => {
    try {
      const { data } = await api.post("/channels/corporate", { canal_key: canalKey });
      navigate(`/messagerie?ch=${data.id}`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Impossible d'ouvrir le canal");
    }
  };

  const filtered = useMemo(() => {
    const list = employees.filter((e) => {
      if (q) {
        const s = `${e.first_name} ${e.last_name} ${e.role} ${e.department}`.toLowerCase();
        if (!s.includes(q.toLowerCase())) return false;
      }
      return true;
    });
    // Alphabetical order by last name, then first name
    return list.sort((a, b) => {
      const la = (a.last_name || "").localeCompare(b.last_name || "", "fr", { sensitivity: "base" });
      if (la !== 0) return la;
      return (a.first_name || "").localeCompare(b.first_name || "", "fr", { sensitivity: "base" });
    });
  }, [employees, q]);

  // Pagination: 6 rows × 3 columns = 18 employees per page on desktop
  const PAGE_SIZE = 18;
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  useEffect(() => { setPage(1); }, [q, tab]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [totalPages, page]);
  const paginated = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  );

  const startDM = async (employeeId) => {
    const { data } = await api.post("/channels/dm", { employee_id: employeeId });
    toast.success("Conversation ouverte");
    navigate(`/messagerie?ch=${data.id}`);
  };

  return (
    <div className="space-y-6 ms-fade-up">
      <div>
        <div className="ms-overline">Annuaire</div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[#071B34] mt-1">
          Contacts entreprise
        </h1>
        <p className="text-sm text-[#475569] mt-2">
          Retrouvez les pôles MS Park et l'équipe au complet.
        </p>
      </div>

      {/* Important notice */}
      <div className="ms-card p-4 flex items-start gap-3 bg-[#3BA4FF]/5 border border-[#3BA4FF]/15">
        <Info className="h-5 w-5 text-[#3BA4FF] mt-0.5 shrink-0" />
        <p className="text-sm text-[#475569]">
          <strong className="text-[#071B34]">Bon usage</strong> : pour toute demande officielle (congés,
          contrat, paie, déclaration), privilégiez l'<strong>email</strong>. Le chat interne est réservé
          aux échanges informels et petites demandes du quotidien.
        </p>
      </div>

      {/* Tabs */}
      <div className="inline-flex rounded-xl bg-white border border-[#071B34]/8 p-1">
        <button
          onClick={() => setTab("poles")}
          data-testid="tab-poles"
          className={`px-4 py-2 text-sm font-semibold rounded-lg ${
            tab === "poles" ? "bg-[#071B34] text-white" : "text-[#475569]"
          }`}
        >
          Pôles
        </button>
        {canDirectory && (
          <button
            onClick={() => setTab("employees")}
            data-testid="tab-employees"
            className={`px-4 py-2 text-sm font-semibold rounded-lg ${
              tab === "employees" ? "bg-[#071B34] text-white" : "text-[#475569]"
            }`}
          >
            Tous les employés
          </button>
        )}
      </div>

      {tab === "poles" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {poles.map((p) => {
            const Icon = iconMap[p.icon] || Users;
            return (
              <div key={p.id} className="ms-card ms-card-hover p-5" data-testid={`pole-${p.id}`}>
                <div className="flex items-start gap-3">
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-xl"
                    style={{ background: `${p.color}1F`, color: p.color }}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-base font-bold text-[#071B34]">{p.name}</h4>
                    <p className="text-xs text-[#475569] mt-0.5">{p.description}</p>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <a
                    href={`mailto:${p.email}`}
                    className="flex items-center gap-2 rounded-lg bg-[#F4F7FA] hover:bg-[#071B34]/5 px-3 py-2 text-xs transition-colors"
                  >
                    <Mail className="h-3.5 w-3.5 text-[#3BA4FF]" />
                    <span className="truncate text-[#071B34]">{p.email}</span>
                  </a>
                  <a
                    href={`tel:${p.phone}`}
                    className="flex items-center gap-2 rounded-lg bg-[#F4F7FA] hover:bg-[#071B34]/5 px-3 py-2 text-xs transition-colors"
                  >
                    <Phone className="h-3.5 w-3.5 text-[#3BA4FF]" />
                    <span className="text-[#071B34]">{p.phone}</span>
                  </a>
                </div>
                <button
                  onClick={() => openServiceChat(p.canal_key || p.id)}
                  data-testid={`pole-chat-${p.id}`}
                  className="mt-3 ms-btn-outline w-full text-xs"
                >
                  <MessageSquare className="h-3.5 w-3.5" /> Ouvrir un chat
                </button>
                <p className="mt-2 text-[10px] text-[#475569] italic text-center">
                  Mail recommandé pour le formel
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <div className="ms-card p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#475569]" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                data-testid="search-contacts"
                placeholder="Rechercher par nom, rôle, service…"
                className="ms-input pl-10"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginated.map((e) => (
              <div
                key={e.id}
                className="ms-card ms-card-hover p-5 flex flex-col items-center text-center"
                data-testid={`contact-${e.id}`}
              >
                <div className="relative">
                  <img
                    src={e.avatar}
                    alt={e.first_name}
                    className="h-20 w-20 rounded-full object-cover ring-2 ring-white shadow-md"
                  />
                  <span
                    className={`absolute bottom-1 right-1 h-3.5 w-3.5 rounded-full ring-2 ring-white ${
                      e.available ? "bg-[#10B981]" : "bg-[#94A3B8]"
                    }`}
                  />
                </div>
                <h4 className="mt-3 text-base font-bold text-[#071B34]">
                  {e.first_name} {e.last_name}
                </h4>
                <p className="text-xs text-[#475569]">{e.role}</p>
                <span className="ms-chip mt-2 bg-[#3BA4FF]/15 text-[#1D70B8]">
                  {e.department}
                </span>
                <div className="mt-4 w-full space-y-2">
                  <a
                    href={`mailto:${e.email}`}
                    className="flex items-center gap-2 rounded-lg bg-[#F4F7FA] hover:bg-[#071B34]/5 px-3 py-2 text-xs"
                  >
                    <Mail className="h-3.5 w-3.5 text-[#3BA4FF]" />
                    <span className="truncate">{e.email}</span>
                  </a>
                  {(e.professional_phone || e.phone) && (
                    <a
                      href={`tel:${e.professional_phone || e.phone}`}
                      data-testid={`phone-${e.id}`}
                      className="flex items-center gap-2 rounded-lg bg-[#F4F7FA] hover:bg-[#071B34]/5 px-3 py-2 text-xs"
                    >
                      <Phone className="h-3.5 w-3.5 text-[#3BA4FF]" />
                      <span className="text-[#071B34]">{e.professional_phone || e.phone}</span>
                    </a>
                  )}
                  {me && e.id !== me.id && (
                    <button
                      onClick={() => startDM(e.id)}
                      data-testid={`dm-${e.id}`}
                      className="w-full ms-btn-outline text-xs"
                    >
                      <MessageSquare className="h-3.5 w-3.5" /> Envoyer un message
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {totalPages > 1 && (
            <div className="ms-card p-3 flex items-center justify-between mt-4" data-testid="contacts-pagination">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                data-testid="contacts-prev"
                className="ms-btn-outline text-xs disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Précédent
              </button>
              <div className="flex items-center gap-1.5">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    data-testid={`contacts-page-${p}`}
                    className={`h-8 min-w-[32px] px-2 rounded-lg text-xs font-semibold transition-colors ${
                      p === page
                        ? "bg-[#071B34] text-white"
                        : "bg-white text-[#475569] hover:bg-[#F4F7FA] border border-[#071B34]/8"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                data-testid="contacts-next"
                className="ms-btn-outline text-xs disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Suivant <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <p className="text-center text-xs text-[#475569] mt-2">
            {filtered.length} contact{filtered.length > 1 ? "s" : ""}
            {totalPages > 1 ? ` — page ${page} / ${totalPages}` : ""}
          </p>
        </>
      )}
    </div>
  );
}
