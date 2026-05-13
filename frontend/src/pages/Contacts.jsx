import { useMemo, useState } from "react";
import { Search, Mail, Phone, MapPin } from "lucide-react";
import { useApp } from "@/contexts/AppContext";

const categoryLabels = {
  employe: "Employé",
  restauration: "Restauration",
  encadrement: "Encadrement",
};

export default function Contacts() {
  const { employees } = useApp();
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("Tous");

  const departments = useMemo(() => {
    const set = new Set(employees.map((e) => e.department));
    return ["Tous", ...Array.from(set)];
  }, [employees]);

  const filtered = useMemo(() => {
    return employees.filter((e) => {
      if (dept !== "Tous" && e.department !== dept) return false;
      if (q) {
        const s = `${e.first_name} ${e.last_name} ${e.role} ${e.department}`.toLowerCase();
        if (!s.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [employees, q, dept]);

  return (
    <div className="space-y-6 ms-fade-up">
      <div>
        <div className="ms-overline">Annuaire</div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[#071B34] mt-1">
          Contacts entreprise
        </h1>
        <p className="text-sm text-[#475569] mt-2">
          Retrouvez l'équipe MS Park au complet.
        </p>
      </div>

      <div className="ms-card p-4 flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#475569]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            data-testid="search-contacts"
            placeholder="Rechercher par nom, rôle, service…"
            className="ms-input pl-10"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {departments.map((d) => (
            <button
              key={d}
              onClick={() => setDept(d)}
              data-testid={`dept-${d}`}
              className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold ${
                dept === d ? "bg-[#071B34] text-white" : "bg-[#F4F7FA] text-[#475569] hover:bg-[#071B34]/5"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((e) => (
          <div key={e.id} className="ms-card ms-card-hover p-5 flex flex-col items-center text-center" data-testid={`contact-${e.id}`}>
            <div className="relative">
              <img src={e.avatar} alt={e.first_name} className="h-20 w-20 rounded-full object-cover ring-2 ring-white shadow-md" />
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
              {categoryLabels[e.role_category] || e.department}
            </span>
            <div className="mt-4 w-full space-y-2 text-left">
              <a
                href={`mailto:${e.email}`}
                className="flex items-center gap-2 rounded-lg bg-[#F4F7FA] hover:bg-[#071B34]/5 px-3 py-2 text-xs text-[#475569] transition-colors"
              >
                <Mail className="h-3.5 w-3.5 text-[#3BA4FF]" />
                <span className="truncate">{e.email}</span>
              </a>
              <a
                href={`tel:${e.phone}`}
                className="flex items-center gap-2 rounded-lg bg-[#F4F7FA] hover:bg-[#071B34]/5 px-3 py-2 text-xs text-[#475569] transition-colors"
              >
                <Phone className="h-3.5 w-3.5 text-[#3BA4FF]" />
                <span>{e.phone}</span>
              </a>
              <div className="flex items-center gap-2 rounded-lg bg-[#F4F7FA] px-3 py-2 text-xs text-[#475569]">
                <MapPin className="h-3.5 w-3.5 text-[#3BA4FF]" />
                <span className="truncate">{e.department}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
